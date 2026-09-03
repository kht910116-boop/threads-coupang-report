import os from "node:os";
import { upperUuid } from "@/lib/id";
import { buildTimeline, type Timeline } from "@/lib/pipeline/timeline";
import { ASPECT_RESOLUTION, type Project, type SceneEffect } from "@/lib/types";

/**
 * 드래프트가 자기를 어느 캡컷이 만들었다고 밝히는 값.
 *
 * 이 값들은 이 PC의 캡컷이 실제로 만든 draft_content.json에서 가져왔다.
 * 예전에는 new_version "110.0.0" / app_version "5.9.0" / os "mac"으로 박혀 있었는데,
 * 짐작으로 넣은 값이었고 실제 캡컷은 183.0.0 / 9.3.0 / windows였다. 특히 윈도우
 * 사용자의 드래프트가 자기를 맥에서 만들었다고 말하고 있었다.
 *
 * **캡컷 버전이 다르면 여기를 고쳐야 한다.** 드래프트가 안 열릴 때 제일 먼저
 * 의심할 자리다. 자기 캡컷이 만든 프로젝트의 draft_content.json을 열어
 * new_version과 platform을 그대로 옮기면 된다.
 */
const DRAFT_VERSION = "183.0.0";

/** os와 os_version은 실행 중인 PC에서 읽는다. 박아두면 또 거짓말을 하게 된다. */
const PLATFORM = {
  app_id: 359289,
  app_source: "cc",
  app_version: "9.3.0",
  device_id: "",
  hard_disk_id: "",
  mac_address: "",
  os: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux",
  os_version: os.release(),
};

/**
 * 캡컷 드래프트 생성기.
 *
 * ⚠️ 읽고 시작할 것
 * 캡컷의 draft_content.json 스키마는 공개 문서가 없고 앱 버전마다 달라진다.
 * 여기 구조는 알려진 형태를 따른 **최선의 추정**이고, 설치된 캡컷 버전에 따라
 * 안 열릴 수 있다. 그래서 내보내기는 항상 범용 번들(에셋+SRT+샷리스트)을 같이 낸다.
 *
 * 효과 처리 방침:
 *   캡컷의 전환(transition)·효과(effect)는 캡컷 내부 라이브러리 id를 알아야 붙는다.
 *   그 id를 확인할 방법이 없어서, **키프레임으로 표현할 수 있는 것만** 실제로 건다:
 *     페이드·디졸브 → 투명도 키프레임
 *     줌인·줌아웃   → 배율 키프레임
 *     좌우 팬       → 위치 키프레임
 *     블랙/화이트 플래시 → 짧은 투명도 급변
 *   블러·글리치·오버레이는 키프레임으로 못 만든다. 타임라인에는 안 걸고
 *   샷리스트에 "수동으로 걸 것"으로 남긴다.
 *
 * 시간 단위는 전부 마이크로초(µs)다.
 */

const US = 1_000_000;
const us = (seconds: number) => Math.round(seconds * US);

/** 키프레임으로 표현할 수 없어 사람이 직접 걸어야 하는 효과들. */
export const MANUAL_EFFECTS: SceneEffect[] = ["blur", "glitch", "overlay"];

interface SegmentExtras {
  speedId: string;
  canvasId: string;
  soundChannelId: string;
  vocalSeparationId: string;
}

interface Extras {
  ids: SegmentExtras;
  speed: unknown;
  canvas: unknown;
  soundChannel: unknown;
  vocalSeparation: unknown;
}

/** 세그먼트마다 딸려 있어야 하는 부속 머티리얼. 없으면 캡컷이 드래프트를 거른다. */
function makeExtras(): Extras {
  const ids: SegmentExtras = {
    speedId: upperUuid(),
    canvasId: upperUuid(),
    soundChannelId: upperUuid(),
    vocalSeparationId: upperUuid(),
  };
  return {
    ids,
    speed: { id: ids.speedId, mode: 0, speed: 1.0, type: "speed", curve_speed: null },
    canvas: {
      id: ids.canvasId, type: "canvas_color", album_image: "", blur: 0.0,
      color: "", image: "", image_id: "", image_name: "", source_platform: 0,
    },
    soundChannel: {
      id: ids.soundChannelId, type: "none",
      audio_channel_mapping: 0, is_config_open: false,
    },
    vocalSeparation: {
      id: ids.vocalSeparationId, type: "vocal_separation",
      choice: 0, production_path: "", time_range: null,
    },
  };
}

interface KeyPoint {
  offsetSec: number;
  value: number;
}

function keyframe(propertyType: string, points: KeyPoint[]): unknown {
  return {
    id: upperUuid(),
    keyframe_list: points.map((point) => ({
      curveType: "Line",
      graphID: "",
      id: upperUuid(),
      left_control: { x: 0.0, y: 0.0 },
      right_control: { x: 0.0, y: 0.0 },
      time_offset: us(point.offsetSec),
      values: [point.value],
    })),
    material_id: "",
    property_type: propertyType,
  };
}

/**
 * 씬 효과와 켄번즈를 키프레임으로 바꾼다.
 * 같은 속성에 둘 다 걸리면 효과 쪽이 이긴다 (더 의도적인 지시라서).
 */
function effectKeyframes(args: {
  effect: SceneEffect;
  durationSec: number;
  transitionSec: number;
  kenBurns: { enabled: boolean; scaleFrom: number; scaleTo: number };
  isVideo: boolean;
}): unknown[] {
  const { effect, durationSec, kenBurns, isVideo } = args;
  const fade = Math.min(args.transitionSec, durationSec / 2);
  const out: unknown[] = [];

  const scaleFromTo = (from: number, to: number) => {
    out.push(
      keyframe("KFTypeScaleX", [
        { offsetSec: 0, value: from },
        { offsetSec: durationSec, value: to },
      ]),
      keyframe("KFTypeScaleY", [
        { offsetSec: 0, value: from },
        { offsetSec: durationSec, value: to },
      ]),
    );
  };

  switch (effect) {
    case "fade":
    case "dissolve":
      out.push(
        keyframe("KFTypeAlpha", [
          { offsetSec: 0, value: 0 },
          { offsetSec: fade, value: 1 },
          { offsetSec: Math.max(fade, durationSec - fade), value: 1 },
          { offsetSec: durationSec, value: effect === "dissolve" ? 0 : 1 },
        ]),
      );
      break;

    case "zoomIn":
      scaleFromTo(1.0, Math.max(1.02, kenBurns.scaleTo));
      break;
    case "zoomOut":
      scaleFromTo(Math.max(1.02, kenBurns.scaleTo), 1.0);
      break;

    case "panLeft":
    case "panRight": {
      // 팬을 하려면 화면 밖으로 나가지 않게 살짝 키워둬야 한다.
      const shift = effect === "panLeft" ? -0.06 : 0.06;
      scaleFromTo(1.08, 1.08);
      out.push(
        keyframe("KFTypePositionX", [
          { offsetSec: 0, value: -shift },
          { offsetSec: durationSec, value: shift },
        ]),
      );
      break;
    }

    case "blackFlash":
    case "whiteFlash":
      // 앞머리에서 확 어두워졌다(밝아졌다) 돌아온다.
      out.push(
        keyframe("KFTypeAlpha", [
          { offsetSec: 0, value: 0 },
          { offsetSec: Math.min(0.12, durationSec / 4), value: 1 },
        ]),
      );
      break;

    default:
      break;
  }

  // 효과가 배율을 안 건드렸고 정지 이미지라면 켄번즈를 건다.
  const touchesScale = ["zoomIn", "zoomOut", "panLeft", "panRight"].includes(effect);
  if (!touchesScale && !isVideo && kenBurns.enabled) {
    scaleFromTo(kenBurns.scaleFrom, kenBurns.scaleTo);
  }
  return out;
}

/** 캡컷 텍스트 머티리얼의 content는 JSON을 문자열로 담은 필드다. */
function textContent(
  text: string,
  style: { fontSize: number; color: string; strokeColor: string; strokeWidth: number },
): string {
  const rgb = (hex: string): [number, number, number] => {
    const clean = hex.replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255,
    ];
  };

  return JSON.stringify({
    text,
    styles: [
      {
        fill: { content: { render_type: "solid", solid: { color: rgb(style.color) } } },
        strokes: [
          {
            content: { render_type: "solid", solid: { color: rgb(style.strokeColor) } },
            width: style.strokeWidth,
          },
        ],
        font: { id: "", path: "" },
        size: style.fontSize,
        range: [0, [...text].length],
      },
    ],
  });
}

function baseSegment(args: {
  materialId: string;
  extras: SegmentExtras;
  startSec: number;
  durationSec: number;
  renderIndex: number;
  keyframes?: unknown[];
  sourceStartSec?: number;
}) {
  return {
    cartoon: false,
    clip: {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0.0,
      scale: { x: 1.0, y: 1.0 },
      transform: { x: 0.0, y: 0.0 },
    },
    common_keyframes: args.keyframes ?? [],
    enable_adjust: true,
    enable_color_curves: true,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    extra_material_refs: [
      args.extras.speedId,
      args.extras.canvasId,
      args.extras.soundChannelId,
      args.extras.vocalSeparationId,
    ],
    group_id: "",
    hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
    id: upperUuid(),
    intensifies_audio: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: [],
    last_nonzero_volume: 1.0,
    material_id: args.materialId,
    render_index: args.renderIndex,
    responsive_layout: {
      enable: false, horizontal_pos_layout: 0, size_layout: 0,
      target_follow: "", vertical_pos_layout: 0,
    },
    reverse: false,
    source_timerange: {
      duration: us(args.durationSec),
      start: us(args.sourceStartSec ?? 0),
    },
    speed: 1.0,
    target_timerange: { duration: us(args.durationSec), start: us(args.startSec) },
    template_id: "",
    template_scene: "default",
    track_attribute: 0,
    track_render_index: 0,
    uniform_scale: { on: true, value: 1.0 },
    visible: true,
    volume: 1.0,
  };
}

/** 자막 한 줄이 너무 길면 접는다. */
function wrapCaption(text: string, maxChars: number): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if ([...candidate].length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

export interface CapCutDraft {
  content: unknown;
  meta: unknown;
  referencedAssets: string[];
  /** 키프레임으로 못 걸어 사람이 직접 넣어야 하는 효과들 */
  manualEffects: Array<{ scene: number; effect: SceneEffect }>;
}

export function buildCapCutDraft(
  project: Project,
  assetPathOf: (relative: string) => string,
  draftFolder: string,
): CapCutDraft {
  const { width, height } = ASPECT_RESOLUTION[project.preset.aspect];
  const timeline: Timeline = buildTimeline(project);

  const videos: unknown[] = [];
  const audios: unknown[] = [];
  const texts: unknown[] = [];
  const speeds: unknown[] = [];
  const canvases: unknown[] = [];
  const soundChannels: unknown[] = [];
  const vocalSeparations: unknown[] = [];

  const videoSegments: unknown[] = [];
  const audioSegments: unknown[] = [];
  const textSegments: unknown[] = [];
  const referencedAssets: string[] = [];
  const manualEffects: Array<{ scene: number; effect: SceneEffect }> = [];

  const pushExtras = (extras: Extras) => {
    speeds.push(extras.speed);
    canvases.push(extras.canvas);
    soundChannels.push(extras.soundChannel);
    vocalSeparations.push(extras.vocalSeparation);
  };

  // ── 영상 트랙: 씬 하나에 한 세그먼트 ──
  const sceneTimingById = new Map(timeline.scenes.map((s) => [s.sceneId, s]));

  for (const scene of [...project.scenes].sort((a, b) => a.index - b.index)) {
    const timing = sceneTimingById.get(scene.id);
    if (!timing) continue;

    const useVideo = scene.mode === "video" && scene.video !== null;
    const visual = useVideo ? scene.video : scene.image;
    if (MANUAL_EFFECTS.includes(scene.effect)) {
      manualEffects.push({ scene: scene.index + 1, effect: scene.effect });
    }
    // 에셋이 없는 씬은 영상 트랙에서만 빠진다. 시간 자리는 그대로 둬야
    // 나레이션·자막이 SRT와 같은 시각에 놓인다.
    if (!visual) continue;

    referencedAssets.push(visual.path);
    const materialId = upperUuid();
    const extras = makeExtras();
    pushExtras(extras);

    videos.push({
      id: materialId,
      type: useVideo ? "video" : "photo",
      path: assetPathOf(visual.path),
      material_name: `scene-${String(scene.index + 1).padStart(3, "0")}`,
      width, height,
      duration: us(useVideo ? timing.durationSec : 10800), // 정지 이미지는 관례상 3시간
      has_audio: false, // 나레이션이 따로 있어 원본 소리는 죽인다
      crop: {
        lower_left_x: 0.0, lower_left_y: 1.0, lower_right_x: 1.0, lower_right_y: 1.0,
        upper_left_x: 0.0, upper_left_y: 0.0, upper_right_x: 1.0, upper_right_y: 0.0,
      },
      crop_ratio: "free", crop_scale: 1.0, category_name: "local",
      check_flag: 62978047, extra_type_option: 0,
      is_ai_generate_content: false, is_unified_beauty_mode: false,
      local_material_id: materialId, source_platform: 0, stable: null,
      video_algorithm: {
        algorithms: [], deflicker: null, motion_blur_config: null,
        noise_reduction: null, path: "", time_range: null,
      },
    });

    videoSegments.push(
      baseSegment({
        materialId,
        extras: extras.ids,
        startSec: timing.startSec,
        durationSec: timing.durationSec,
        renderIndex: scene.index,
        keyframes: effectKeyframes({
          effect: scene.effect,
          durationSec: timing.durationSec,
          transitionSec: project.effects.transitionSec,
          kenBurns: project.effects.kenBurns,
          isVideo: useVideo,
        }),
      }),
    );
  }

  // ── 음성 트랙 + 자막 트랙: 자막 라인 하나에 한 세그먼트씩 ──
  const lineById = new Map(project.lines.map((l) => [l.id, l]));
  const { caption } = project;

  for (const timing of timeline.lines) {
    const line = lineById.get(timing.lineId);
    if (!line) continue;
    const duration = timing.endSec - timing.startSec;

    if (line.audio) {
      referencedAssets.push(line.audio.path);
      const audioId = upperUuid();
      const extras = makeExtras();
      pushExtras(extras);

      audios.push({
        id: audioId,
        type: "extract_music",
        path: assetPathOf(line.audio.path),
        name: `line-${String(line.index + 1).padStart(3, "0")}`,
        duration: us(line.audio.durationSec),
        category_name: "local", check_flag: 1, source_platform: 0,
        music_id: audioId, local_material_id: audioId,
      });
      audioSegments.push(
        baseSegment({
          materialId: audioId,
          extras: extras.ids,
          startSec: timing.startSec,
          durationSec: duration,
          renderIndex: line.index,
        }),
      );
    }

    if (caption.enabled && line.text.trim()) {
      const textId = upperUuid();
      const extras = makeExtras();
      pushExtras(extras);

      texts.push({
        id: textId,
        type: "text",
        content: textContent(wrapCaption(line.text, caption.maxCharsPerLine), caption),
        font_size: caption.fontSize,
        // 폰트는 캡컷에 설치된 이름으로 지정한다. 없으면 캡컷이 기본 폰트로 대체한다.
        font_name: caption.fontFamily,
        font_path: "",
        alignment: 1,
        background_alpha: 0.0,
        border_width: caption.strokeWidth,
        has_shadow: true,
        letter_spacing: 0.0,
        line_spacing: 0.02,
        text_alpha: 1.0,
        typesetting: 0,
        force_apply_line_max_width: false,
      });

      const segment = baseSegment({
        materialId: textId,
        extras: extras.ids,
        startSec: timing.startSec,
        durationSec: duration,
        renderIndex: line.index,
      }) as Record<string, unknown>;

      // 캡컷 좌표는 화면 중앙이 0, 아래가 양수다.
      const y =
        caption.position === "center"
          ? 0
          : (caption.position === "bottom" ? 1 : -1) * (1 - caption.marginRatio * 2);
      segment.clip = {
        ...(segment.clip as object),
        transform: { x: 0.0, y },
      };
      textSegments.push(segment);
    }
  }

  const track = (type: string, segments: unknown[]) => ({
    attribute: 0, flag: 0, id: upperUuid(),
    is_default_name: true, name: "", segments, type,
  });

  const content = {
    // background 필드가 실제 드래프트에는 있다. 없다고 안 열리는지는 모르지만,
    // 확인할 수 있는 차이는 없애 두는 편이 낫다.
    canvas_config: { width, height, ratio: "original", background: null },
    color_space: 0,
    config: {
      adjust_max_index: 1, attachment_info: [], combination_max_index: 1,
      export_range: null, extract_audio_last_index: 1, lyrics_recognition_id: "",
      lyrics_sync: true, lyrics_taskinfo: [], maintrack_adsorb: true,
      material_save_mode: 0, original_sound_last_index: 1, record_audio_last_index: 1,
      sticker_max_index: 1, subtitle_recognition_id: "", subtitle_sync: true,
      subtitle_taskinfo: [], video_mute: false, zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    duration: us(timeline.totalSec),
    extra_info: null,
    fps: project.preset.fps,
    free_render_index_mode_on: false,
    group_container: null,
    id: upperUuid(),
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [], audios: [], effects: [], filters: [],
      handwrites: [], stickers: [], texts: [], videos: [],
    },
    materials: {
      ai_translates: [], audio_balances: [], audio_effects: [], audio_fades: [],
      audio_track_indexes: [], audios, beats: [], canvases, chromas: [],
      color_curves: [], digital_humans: [], drafts: [], effects: [], flowers: [],
      green_screens: [], hsl: [], images: [], log_color_wheels: [], loudnesses: [],
      manual_deformations: [], masks: [], material_animations: [], material_colors: [],
      multi_language_refs: [], placeholders: [], plugin_effects: [],
      primary_color_wheels: [], realtime_denoises: [], shapes: [], smart_crops: [],
      smart_relights: [], sound_channel_mappings: soundChannels, speeds, stickers: [],
      tail_leaders: [], text_templates: [], texts, time_marks: [], transitions: [],
      video_effects: [], video_trackings: [], videos, vocal_beautifys: [],
      vocal_separations: vocalSeparations,
      // 실제 드래프트에는 있는데 우리에게 없던 것들. 전부 빈 목록이면 되는 자리다.
      ai_text_effects: [], audio_pannings: [], audio_pitch_shifts: [],
      common_mask: [], digital_human_model_dressing: [], handwrites: [],
      hsl_curves: [], manual_beautys: [], placeholder_infos: [],
      video_radius: [], video_shadows: [], video_strokes: [],
    },
    mutable_config: null,
    name: "",
    new_version: DRAFT_VERSION,
    platform: PLATFORM,
    last_modified_platform: PLATFORM,
    relationships: [],
    // 아래 여덟은 실제 드래프트에 있는데 우리가 안 내던 것들이다.
    draft_type: "video",
    path: "",
    is_drop_frame_timecode: false,
    mixed_track_mode_on: false,
    lyrics_effects: [],
    time_marks: null,
    smart_ads_info: { page_from: "", routine: "", draft_url: "" },
    uneven_animation_template_info: {
      composition: "", content: "", order: "", sub_template_info_list: [],
    },
    function_assistant_info: {
      smart_rec_applied: false, fixed_rec_applied: false,
      auto_adjust: false, auto_adjust_segid_list: [],
      color_correction: false, color_correction_segid_list: [],
      enhance_quality: false, smooth_slow_motion: false,
      deflicker_segid_list: [], video_noise_segid_list: [],
      enhance_quality_segid_list: [], smart_segid_list: [],
      retouch: false, retouch_segid_list: [],
      enhande_voice: false, enhance_voice_segid_list: [],
      audio_noise_segid_list: [],
      auto_caption: false, auto_caption_segid_list: [], auto_caption_template_id: "",
      caption_opt: false, caption_opt_segid_list: [],
      eye_correction: false, eye_correction_segid_list: [],
      normalize_loudness: false, normalize_loudness_segid_list: [],
      normalize_loudness_audio_denoise_segid_list: [],
      auto_adjust_fixed: false, auto_adjust_fixed_value: 50.0,
      color_correction_fixed: false, color_correction_fixed_value: 50.0,
      normalize_loudness_fixed: false, enhande_voice_fixed: false,
      retouch_fixed: false, enhance_quality_fixed: false,
      smooth_slow_motion_fixed: false,
      fps: { num: 0, den: 1 },
    },
    render_index_track_mode_on: true,
    retouch_cover: null,
    source: "default",
    static_cover_image_path: "",
    tracks: [
      track("video", videoSegments),
      ...(audioSegments.length > 0 ? [track("audio", audioSegments)] : []),
      ...(textSegments.length > 0 ? [track("text", textSegments)] : []),
    ],
    update_time: 0,
    version: 360000,
  };

  const nowUs = Date.now() * 1000;
  const meta = {
    cloud_package_completed_time: "", draft_cloud_capcut_purchase_info: "",
    draft_cloud_last_action_download: false, draft_cloud_materials: [],
    draft_cloud_purchase_info: "", draft_cloud_template_id: "",
    draft_cloud_tutorial_info: "", draft_cloud_videocut_purchase_info: "",
    draft_cover: "draft_cover.jpg", draft_deeplink_url: "",
    draft_enterprise_info: {
      draft_enterprise_extra: "", draft_enterprise_id: "",
      draft_enterprise_name: "", enterprise_material: null,
    },
    draft_fold_path: draftFolder,
    draft_id: upperUuid(),
    draft_is_ai_packaging_used: false, draft_is_ai_shorts: false,
    draft_is_article_video_draft: false, draft_is_from_deeplink: "false",
    draft_materials: [],
    draft_name: project.title || project.topic,
    draft_new_version: "", draft_removable_storage_device: "",
    draft_root_path: draftFolder.replace(/[\\/][^\\/]+$/, ""),
    draft_segment_extra_info: [], draft_timeline_materials_size_: 0, draft_type: "",
    tm_draft_cloud_completed: "", tm_draft_cloud_modified: 0,
    tm_draft_create: nowUs, tm_draft_modified: nowUs, tm_draft_removed: 0,
    tm_duration: us(timeline.totalSec),
  };

  return { content, meta, referencedAssets, manualEffects };
}

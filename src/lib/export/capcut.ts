import { upperUuid } from "@/lib/id";
import { ASPECT_RESOLUTION, type Cut, type Project } from "@/lib/types";

/**
 * 캡컷 드래프트 생성기.
 *
 * ⚠️ 읽고 시작할 것
 * 캡컷의 draft_content.json 스키마는 공개 문서가 없고 앱 버전마다 달라진다.
 * 여기 있는 구조는 알려진 형태를 따라 만든 **최선의 추정**이고, 설치된
 * 캡컷 버전에 따라 안 열릴 수 있다. 그래서 내보내기는 항상 두 벌을 만든다.
 *
 *   1) 이 드래프트 (열리면 컷·자막·음성이 타임라인에 그대로 얹혀 있다)
 *   2) bundle.ts의 범용 번들 (에셋 + SRT + 샷리스트 — 어떤 편집기에서든 통한다)
 *
 * 드래프트가 안 열려도 2번으로 작업은 이어진다.
 *
 * 시간 단위는 전부 마이크로초(µs)다.
 */

const US = 1_000_000;
const us = (seconds: number) => Math.round(seconds * US);

/** 세그먼트마다 딸려 있어야 하는 부속 머티리얼. 없으면 캡컷이 드래프트를 거른다. */
interface SegmentExtras {
  speedId: string;
  canvasId: string;
  soundChannelId: string;
  vocalSeparationId: string;
}

function makeExtras(): {
  ids: SegmentExtras;
  speed: unknown;
  canvas: unknown;
  soundChannel: unknown;
  vocalSeparation: unknown;
} {
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
      id: ids.canvasId,
      type: "canvas_color",
      album_image: "",
      blur: 0.0,
      color: "",
      image: "",
      image_id: "",
      image_name: "",
      source_platform: 0,
    },
    soundChannel: {
      id: ids.soundChannelId,
      type: "none",
      audio_channel_mapping: 0,
      is_config_open: false,
    },
    vocalSeparation: {
      id: ids.vocalSeparationId,
      type: "vocal_separation",
      choice: 0,
      production_path: "",
      time_range: null,
    },
  };
}

/** 켄번즈(느린 줌) 키프레임. image 모드 컷을 살아 있게 만드는 부분이다. */
function kenBurnsKeyframes(
  durationSec: number,
  from: number,
  to: number,
): unknown[] {
  const point = (timeOffset: number, value: number) => ({
    curveType: "Line",
    graphID: "",
    id: upperUuid(),
    left_control: { x: 0.0, y: 0.0 },
    right_control: { x: 0.0, y: 0.0 },
    time_offset: timeOffset,
    values: [value],
  });

  return ["KFTypeScaleX", "KFTypeScaleY"].map((propertyType) => ({
    id: upperUuid(),
    keyframe_list: [point(0, from), point(us(durationSec), to)],
    material_id: "",
    property_type: propertyType,
  }));
}

/** 캡컷 텍스트 머티리얼의 content는 JSON을 문자열로 담은 필드다. */
function textContent(text: string, fontSize: number): string {
  return JSON.stringify({
    text,
    styles: [
      {
        fill: { content: { render_type: "solid", solid: { color: [1, 1, 1] } } },
        strokes: [
          {
            content: { render_type: "solid", solid: { color: [0, 0, 0] } },
            width: 0.08,
          },
        ],
        font: { id: "", path: "" },
        size: fontSize,
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
      enable: false,
      horizontal_pos_layout: 0,
      size_layout: 0,
      target_follow: "",
      vertical_pos_layout: 0,
    },
    reverse: false,
    source_timerange: { duration: us(args.durationSec), start: 0 },
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

export interface CapCutDraft {
  content: unknown;
  meta: unknown;
  /** 드래프트가 참조하는 파일들 — 번들로 복사해야 하는 목록 */
  referencedAssets: string[];
}

/**
 * @param project     기획·에셋이 채워진 프로젝트
 * @param assetPathOf 컷 에셋의 **절대 경로**를 돌려주는 함수.
 *                    캡컷은 상대 경로를 못 읽어서 절대 경로가 필요하다.
 * @param draftFolder 이 드래프트가 놓일 폴더의 절대 경로
 */
export function buildCapCutDraft(
  project: Project,
  assetPathOf: (relative: string) => string,
  draftFolder: string,
): CapCutDraft {
  const { preset } = project;
  const { width, height } = ASPECT_RESOLUTION[preset.aspect];

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

  let cursorSec = 0;

  project.cuts.forEach((cut: Cut, index: number) => {
    const useVideo = cut.mode === "video" && cut.video !== null;
    const visual = useVideo ? cut.video : cut.image;
    const duration = cut.durationSec;

    // 이미지/영상이 아직 없는 컷은 영상 트랙에서만 빠진다 (빈 참조는 드래프트를 깬다).
    // 컷의 시간 자리는 그대로 두어야 나레이션·자막이 SRT와 같은 시각에 놓인다.
    if (visual) {
      referencedAssets.push(visual.path);

      const materialId = upperUuid();
      const extras = makeExtras();
      speeds.push(extras.speed);
      canvases.push(extras.canvas);
      soundChannels.push(extras.soundChannel);
      vocalSeparations.push(extras.vocalSeparation);

      videos.push({
        id: materialId,
        type: useVideo ? "video" : "photo",
        path: assetPathOf(visual.path),
        material_name: `cut-${String(index + 1).padStart(2, "0")}`,
        width,
        height,
        duration: us(useVideo ? duration : 10800), // 정지 이미지는 캡컷 관례상 3시간
        has_audio: useVideo,
        crop: {
          lower_left_x: 0.0, lower_left_y: 1.0,
          lower_right_x: 1.0, lower_right_y: 1.0,
          upper_left_x: 0.0, upper_left_y: 0.0,
          upper_right_x: 1.0, upper_right_y: 0.0,
        },
        crop_ratio: "free",
        crop_scale: 1.0,
        category_name: "local",
        check_flag: 62978047,
        extra_type_option: 0,
        is_ai_generate_content: false,
        is_unified_beauty_mode: false,
        local_material_id: materialId,
        source_platform: 0,
        stable: null,
        video_algorithm: {
          algorithms: [], deflicker: null, motion_blur_config: null,
          noise_reduction: null, path: "", time_range: null,
        },
      });

      videoSegments.push(
        baseSegment({
          materialId,
          extras: extras.ids,
          startSec: cursorSec,
          durationSec: duration,
          renderIndex: index,
          keyframes:
            !useVideo && preset.video.kenBurns.enabled
              ? kenBurnsKeyframes(
                  duration,
                  preset.video.kenBurns.scaleFrom,
                  preset.video.kenBurns.scaleTo,
                )
              : [],
        }),
      );
    }

    // ── 나레이션 음성 ──
    if (cut.audio) {
      const audioId = upperUuid();
      const audioExtras = makeExtras();
      speeds.push(audioExtras.speed);
      canvases.push(audioExtras.canvas);
      soundChannels.push(audioExtras.soundChannel);
      vocalSeparations.push(audioExtras.vocalSeparation);
      referencedAssets.push(cut.audio.path);

      audios.push({
        id: audioId,
        type: "extract_music",
        path: assetPathOf(cut.audio.path),
        name: `narration-${index + 1}`,
        duration: us(duration),
        category_name: "local",
        check_flag: 1,
        source_platform: 0,
        music_id: audioId,
        local_material_id: audioId,
      });
      audioSegments.push(
        baseSegment({
          materialId: audioId,
          extras: audioExtras.ids,
          startSec: cursorSec,
          durationSec: duration,
          renderIndex: index,
        }),
      );
    }

    // ── 자막 ──
    const captionText =
      preset.caption.source === "narration" ? cut.narration : cut.onScreenText;
    if (preset.caption.enabled && captionText.trim()) {
      const textId = upperUuid();
      const textExtras = makeExtras();
      speeds.push(textExtras.speed);
      canvases.push(textExtras.canvas);
      soundChannels.push(textExtras.soundChannel);
      vocalSeparations.push(textExtras.vocalSeparation);

      texts.push({
        id: textId,
        type: "text",
        content: textContent(captionText, preset.caption.fontSize),
        font_size: preset.caption.fontSize,
        alignment: 1,
        background_alpha: 0.0,
        border_width: 0.08,
        has_shadow: true,
        letter_spacing: 0.0,
        line_spacing: 0.02,
        text_alpha: 1.0,
        typesetting: 0,
        force_apply_line_max_width: false,
      });

      const segment = baseSegment({
        materialId: textId,
        extras: textExtras.ids,
        startSec: cursorSec,
        durationSec: duration,
        renderIndex: index,
      }) as Record<string, unknown>;

      // 자막 세로 위치. 캡컷 좌표는 화면 중앙이 0, 아래가 양수다.
      const yByPosition = { top: -0.72, center: 0.0, bottom: 0.72 };
      segment.clip = {
        ...(segment.clip as object),
        transform: { x: 0.0, y: yByPosition[preset.caption.position] },
      };
      textSegments.push(segment);
    }

    cursorSec += duration;
  });

  const totalDuration = us(cursorSec);
  const track = (type: string, segments: unknown[]) => ({
    attribute: 0,
    flag: 0,
    id: upperUuid(),
    is_default_name: true,
    name: "",
    segments,
    type,
  });

  const content = {
    canvas_config: { width, height, ratio: "original" },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: "",
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_recognition_id: "",
      subtitle_sync: true,
      subtitle_taskinfo: [],
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    duration: totalDuration,
    extra_info: null,
    fps: preset.fps,
    free_render_index_mode_on: false,
    group_container: null,
    id: upperUuid(),
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [], audios: [], effects: [], filters: [],
      handwrites: [], stickers: [], texts: [], videos: [],
    },
    materials: {
      ai_translates: [], audio_balances: [], audio_effects: [],
      audio_fades: [], audio_track_indexes: [],
      audios,
      beats: [], canvases, chromas: [], color_curves: [],
      digital_humans: [], drafts: [], effects: [], flowers: [],
      green_screens: [], hsl: [], images: [], log_color_wheels: [],
      loudnesses: [], manual_deformations: [], masks: [],
      material_animations: [], material_colors: [], multi_language_refs: [],
      placeholders: [], plugin_effects: [], primary_color_wheels: [],
      realtime_denoises: [], shapes: [], smart_crops: [],
      smart_relights: [], sound_channel_mappings: soundChannels,
      speeds, stickers: [], tail_leaders: [], text_templates: [],
      texts, time_marks: [], transitions: [], video_effects: [],
      video_trackings: [], videos, vocal_beautifys: [],
      vocal_separations: vocalSeparations,
    },
    mutable_config: null,
    name: "",
    new_version: "110.0.0",
    platform: {
      app_id: 3704, app_source: "cc", app_version: "5.9.0",
      device_id: "", hard_disk_id: "", mac_address: "", os: "mac", os_version: "",
    },
    relationships: [],
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
    cloud_package_completed_time: "",
    draft_cloud_capcut_purchase_info: "",
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cloud_purchase_info: "",
    draft_cloud_template_id: "",
    draft_cloud_tutorial_info: "",
    draft_cloud_videocut_purchase_info: "",
    draft_cover: "draft_cover.jpg",
    draft_deeplink_url: "",
    draft_enterprise_info: {
      draft_enterprise_extra: "",
      draft_enterprise_id: "",
      draft_enterprise_name: "",
      enterprise_material: null,
    },
    draft_fold_path: draftFolder,
    draft_id: upperUuid(),
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_article_video_draft: false,
    draft_is_from_deeplink: "false",
    draft_materials: [],
    draft_name: project.plan?.title ?? project.topic,
    draft_new_version: "",
    draft_removable_storage_device: "",
    draft_root_path: draftFolder.replace(/[\\/][^\\/]+$/, ""),
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: 0,
    draft_type: "",
    tm_draft_cloud_completed: "",
    tm_draft_cloud_modified: 0,
    tm_draft_create: nowUs,
    tm_draft_modified: nowUs,
    tm_draft_removed: 0,
    tm_duration: totalDuration,
  };

  return { content, meta, referencedAssets };
}

import { z } from "zod";

/**
 * 이 파일이 앱 전체의 계약이다.
 *
 * 파이프라인:
 *   1 대본(레퍼런스 최대 5개)  →  2 구조(훅+인트로+행동유도-파트N-클로징)
 *   →  3 TTS(무음·모델·자막 옵션)  →  4 스토리보드(자막 라인을 씬으로 묶기)
 *   →  5 일관된 이미지  →  6 영상화할 컷 선택  →  7 자막·효과  →  8 캡컷 내보내기
 *
 * 핵심 단위 두 가지:
 *   **자막 라인(ScriptLine)** — 대본의 최소 단위. TTS 한 덩어리이자 자막 한 줄.
 *   **씬(Scene)** — 연속된 자막 라인 묶음. 이미지/영상 한 장이 걸리는 단위.
 *
 * 씬은 라인을 임의로 묶는 게 아니라, 그 라인들의 **실제 음성 길이 합**이
 * 파트별 '장면 간격' 범위에 들어오도록 묶는다.
 */

// ─────────────────────────────────────────────────────────────
// 기본
// ─────────────────────────────────────────────────────────────

export const ASPECTS = ["9:16", "16:9", "1:1"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const ASPECT_RESOLUTION: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

/** 대본 구조. 파트는 여러 개 올 수 있고 나머지는 한 번씩이다. */
export const SECTION_KINDS = ["hook", "intro", "cta", "part", "closing"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const SECTION_LABEL: Record<SectionKind, string> = {
  hook: "훅",
  intro: "인트로",
  cta: "행동유도",
  part: "파트",
  closing: "클로징",
};

/** 장면 간격은 이 세 묶음으로만 설정한다 (화면의 슬라이더 3개와 같다). */
export const INTERVAL_GROUPS = ["hookIntro", "part", "closing"] as const;
export type IntervalGroup = (typeof INTERVAL_GROUPS)[number];

export function intervalGroupOf(kind: SectionKind): IntervalGroup {
  if (kind === "hook" || kind === "intro" || kind === "cta") return "hookIntro";
  if (kind === "closing") return "closing";
  return "part";
}

export const CUT_MODES = ["image", "video"] as const;
export type CutMode = (typeof CUT_MODES)[number];

/** 씬 전환·연출 효과. 캡컷으로 나갈 때 각각의 표현으로 옮긴다. */
export const SCENE_EFFECTS = [
  "none",
  "fade",
  "dissolve",
  "zoomIn",
  "zoomOut",
  "panLeft",
  "panRight",
  "blur",
  "blackFlash",
  "whiteFlash",
  "overlay",
  "glitch",
] as const;
export type SceneEffect = (typeof SCENE_EFFECTS)[number];

export const EFFECT_LABEL: Record<SceneEffect, string> = {
  none: "없음",
  fade: "페이드",
  dissolve: "디졸브",
  zoomIn: "줌인",
  zoomOut: "줌아웃",
  panLeft: "좌로 팬",
  panRight: "우로 팬",
  blur: "블러",
  blackFlash: "블랙 플래시",
  whiteFlash: "화이트 플래시",
  overlay: "오버레이",
  glitch: "글리치",
};

/**
 * 프로바이더 id.
 *
 * 아래는 코드에 박혀 있는 것들이고, 여기 없는 값도 올 수 있다:
 *   "web:<레시피id>" — 구독 웹을 브라우저로 돌려 파일을 받아온다 (API 키 불필요).
 * 그래서 프로바이더 필드는 열거형이 아니라 문자열이다.
 */
export const TTS_PROVIDERS = [
  "manual",
  "elevenlabs",
  "typecast",
  "google-ai-studio",
  "google-cloud",
] as const;
export type TtsProviderId = string;

export const IMAGE_PROVIDERS = ["manual", "gemini", "openai"] as const;
export type ImageProviderId = string;

export const VIDEO_PROVIDERS = ["manual", "gemini-veo"] as const;
export type VideoProviderId = string;

/** 구독 웹 레시피를 프로바이더 id로 쓰는 접두어. */
export const WEB_PROVIDER_PREFIX = "web:";
export const isWebProvider = (id: string) => id.startsWith(WEB_PROVIDER_PREFIX);
export const webRecipeIdOf = (id: string) => id.slice(WEB_PROVIDER_PREFIX.length);

// ─────────────────────────────────────────────────────────────
// 설정 묶음 — 프리셋과 프로젝트가 공유한다
// ─────────────────────────────────────────────────────────────

/** 파트별 장면 길이 기준(초). 씬을 묶는 규칙이 된다. */
export const intervalsSchema = z.object({
  hookIntro: z.object({ min: z.number().positive(), max: z.number().positive() }),
  part: z.object({ min: z.number().positive(), max: z.number().positive() }),
  closing: z.object({ min: z.number().positive(), max: z.number().positive() }),
});
export type Intervals = z.infer<typeof intervalsSchema>;

/**
 * 이미지 화풍. 첨부 스토리보드처럼 **접두부 + 장면 묘사 + 접미부** 구조다.
 * 접두부·접미부가 모든 씬에 똑같이 붙어서 그림체가 흔들리지 않는다.
 */
export const imageStyleSchema = z.object({
  provider: z.string().default("manual"),
  model: z.string().default(""),
  /** 모든 프롬프트 맨 앞에 붙는 화풍 문구 */
  prefix: z.string().default(""),
  /** 모든 프롬프트 맨 뒤에 붙는 문구 (자막 금지, 워터마크 금지 등) */
  suffix: z.string().default(""),
  negativePrompt: z.string().default(""),
});
export type ImageStyle = z.infer<typeof imageStyleSchema>;

export const ttsSettingsSchema = z.object({
  provider: z.string().default("manual"),
  /** 서비스 안의 세부 모델 (예: eleven_multilingual_v2, ssfm-v21) */
  model: z.string().default(""),
  voiceId: z.string().default(""),
  speed: z.number().default(1.0),
  pitch: z.number().default(0),
  /** 영상 맨 앞 무음(ms) */
  leadSilenceMs: z.number().int().min(0).default(300),
  /** 영상 맨 뒤 무음(ms) */
  tailSilenceMs: z.number().int().min(0).default(500),
  /** 자막 라인 사이 무음(ms) — 호흡을 만든다 */
  gapMs: z.number().int().min(0).default(180),
  /** 파트가 바뀔 때 추가로 주는 무음(ms) */
  sectionGapMs: z.number().int().min(0).default(450),
});
export type TtsSettings = z.infer<typeof ttsSettingsSchema>;

export const captionStyleSchema = z.object({
  enabled: z.boolean().default(true),
  /** 미리캔버스 프로·캔바 폰트 등 실제 설치된 폰트 이름 */
  fontFamily: z.string().default("Pretendard"),
  fontSize: z.number().default(12),
  color: z.string().default("#FFFFFF"),
  strokeColor: z.string().default("#000000"),
  strokeWidth: z.number().default(0.08),
  position: z.enum(["top", "center", "bottom"]).default("bottom"),
  /** 화면 높이 대비 위/아래 여백 비율 */
  marginRatio: z.number().default(0.12),
  /** 한 줄 최대 글자수 — 넘으면 줄바꿈한다 */
  maxCharsPerLine: z.number().int().positive().default(20),
});
export type CaptionStyle = z.infer<typeof captionStyleSchema>;

export const effectSettingsSchema = z.object({
  /** 씬에 기본으로 걸리는 효과 */
  defaultEffect: z.enum(SCENE_EFFECTS).default("fade"),
  transitionSec: z.number().default(0.4),
  /** 정지 이미지에 거는 느린 줌 */
  kenBurns: z.object({
    enabled: z.boolean().default(true),
    scaleFrom: z.number().default(1.0),
    scaleTo: z.number().default(1.1),
  }),
  /** 씬마다 효과를 돌려가며 쓸지 — 같은 효과가 이어지면 지루하다 */
  rotate: z.boolean().default(true),
  rotation: z.array(z.enum(SCENE_EFFECTS)).default(["fade", "dissolve", "zoomIn", "zoomOut"]),
});
export type EffectSettings = z.infer<typeof effectSettingsSchema>;

// ─────────────────────────────────────────────────────────────
// 프리셋 (= 스타일). 새 프로젝트의 출발점이다.
// ─────────────────────────────────────────────────────────────

export const presetSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),

  aspect: z.enum(ASPECTS),
  fps: z.number().int().min(24).max(60).default(30),
  targetDurationSec: z.number().int().min(15).max(3600),

  script: z.object({
    language: z.string().default("ko"),
    persona: z.string().default(""),
    tone: z.string().default(""),
    /** 파트 개수 */
    partCount: z.number().int().min(1).max(12).default(3),
    /** 자막 한 줄 목표 글자수 — TTS·자막 단위가 된다 */
    charsPerLine: z.object({ min: z.number().int(), max: z.number().int() }),
    avoid: z.array(z.string()).default([]),
  }),

  intervals: intervalsSchema,
  image: imageStyleSchema,
  video: z.object({
    defaultMode: z.enum(CUT_MODES).default("image"),
    provider: z.string().default("manual"),
    model: z.string().default(""),
  }),
  tts: ttsSettingsSchema,
  caption: captionStyleSchema,
  effects: effectSettingsSchema,

  createdAt: z.string(),
  updatedAt: z.string(),
  builtin: z.boolean().default(false),
});
export type Preset = z.infer<typeof presetSchema>;

export const presetInputSchema = presetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  builtin: true,
});
export type PresetInput = z.infer<typeof presetInputSchema>;

// ─────────────────────────────────────────────────────────────
// 1~2단계: 레퍼런스와 대본
// ─────────────────────────────────────────────────────────────

export const referenceSchema = z.object({
  url: z.string().url(),
  title: z.string().default(""),
  /** 이 링크에서 무엇을 가져올지 */
  note: z.string().default(""),
});
export type Reference = z.infer<typeof referenceSchema>;

export const MAX_REFERENCES = 5;

/** Claude가 만드는 대본의 한 줄 = 자막 한 줄 = TTS 한 덩어리. */
export const scriptLinePlanSchema = z.object({
  text: z.string(),
});

export const scriptSectionPlanSchema = z.object({
  kind: z.enum(SECTION_KINDS),
  /** 파트일 때의 소제목. 나머지는 비워도 된다. */
  title: z.string(),
  lines: z.array(scriptLinePlanSchema),
});

export const scriptPlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  thumbnailPrompt: z.string(),
  sections: z.array(scriptSectionPlanSchema),
});
export type ScriptPlan = z.infer<typeof scriptPlanSchema>;

/** 저장되는 자막 라인. 음성이 붙으면 길이가 채워진다. */
export const scriptLineSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  /** 전체 대본에서의 통짜 순번 — 자막 번호로 그대로 쓴다 */
  index: z.number().int(),
  text: z.string(),
  /**
   * TTS가 읽을 글자. 비어 있으면 text를 그대로 읽는다.
   *
   * 자막에 보이는 글자와 읽는 글자는 다르다. 자막은 "1,030억 원"이 맞고 음성은
   * "천삼십억 원"이 맞다. 한 칸에 담으면 둘 중 하나는 반드시 틀린다.
   */
  spokenText: z.string().default(""),
  audio: z
    .object({
      path: z.string(),
      provider: z.string(),
      durationSec: z.number(),
      createdAt: z.string(),
    })
    .nullable(),
});
export type ScriptLine = z.infer<typeof scriptLineSchema>;

export const scriptSectionSchema = z.object({
  id: z.string(),
  kind: z.enum(SECTION_KINDS),
  title: z.string(),
  /** 파트 번호 (파트가 아니면 0) */
  partNumber: z.number().int().default(0),
  order: z.number().int(),
});
export type ScriptSection = z.infer<typeof scriptSectionSchema>;

// ─────────────────────────────────────────────────────────────
// 4~7단계: 씬
// ─────────────────────────────────────────────────────────────

export const assetRefSchema = z.object({
  path: z.string(),
  provider: z.string(),
  createdAt: z.string(),
});
export type AssetRef = z.infer<typeof assetRefSchema>;

/** Claude가 채우는 씬의 내용물. */
export const scenePlanSchema = z.object({
  summaryKo: z.string(),
  /** 화풍 접두·접미를 뺀 **장면 묘사만**. 영문. */
  prompt: z.string(),
  motionPrompt: z.string(),
});

export const sceneSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  /** 전체 씬 통짜 번호 */
  index: z.number().int(),
  /** 이 씬이 덮는 자막 라인 번호 범위 (양끝 포함) */
  lineFrom: z.number().int(),
  lineTo: z.number().int(),
  summaryKo: z.string(),
  prompt: z.string(),
  motionPrompt: z.string(),
  /** 라인 음성 길이의 합. 음성 전에는 추정값이다. */
  durationSec: z.number(),
  mode: z.enum(CUT_MODES),
  effect: z.enum(SCENE_EFFECTS),
  /** 화면의 '대체 가능' — 다른 그림으로 바꿔도 무방한 씬 */
  replaceable: z.boolean(),
  image: assetRefSchema.nullable(),
  video: assetRefSchema.nullable(),
  /** 사용자가 손댄 씬은 다시 만들 때 보존한다 */
  locked: z.boolean(),
});
export type Scene = z.infer<typeof sceneSchema>;

// ─────────────────────────────────────────────────────────────
// 프로젝트
// ─────────────────────────────────────────────────────────────

export const STEPS = [
  "script",
  "structure",
  "tts",
  "storyboard",
  "images",
  "videos",
  "styling",
  "export",
] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABEL: Record<Step, string> = {
  script: "대본",
  structure: "구조",
  tts: "음성",
  storyboard: "스토리보드",
  images: "이미지",
  videos: "영상화",
  styling: "자막·효과",
  export: "캡컷",
};

/**
 * 단계 제목 밑에 붙는 한 줄 설명.
 *
 * 라벨만으로는 그 단계에서 무엇이 만들어지는지 알 수 없다. 특히 '구조'나
 * '스토리보드'처럼 이름이 추상적인 단계가 그렇다. 화면마다 이 문장이 제목
 * 바로 밑에 붙어서, 지금 뭘 하는 자리인지를 매번 다시 말해준다.
 */
export const STEP_DESC: Record<Step, string> = {
  script: "주제와 레퍼런스를 근거로 대본을 씁니다.",
  structure: "대본을 구간과 자막 줄로 나누고 다듬습니다.",
  tts: "자막 줄마다 음성을 만들고 쉼을 조절합니다.",
  storyboard: "음성 길이에 맞춰 장면을 묶고 그림 설명을 붙입니다.",
  images: "장면마다 그림을 만듭니다. 화풍은 전 장면이 같이 갑니다.",
  videos: "영상으로 갈 장면만 골라 움직이게 만듭니다.",
  styling: "자막 모양과 장면 효과를 정합니다.",
  export: "캡컷 드래프트와 범용 번들을 함께 내보냅니다.",
};

export const projectSchema = z.object({
  id: z.string(),
  topic: z.string(),
  brief: z.string(),
  references: z.array(referenceSchema).max(MAX_REFERENCES),

  presetId: z.string(),
  /** 생성 시점의 프리셋 사본. 프리셋을 나중에 고쳐도 이 프로젝트는 안 흔들린다. */
  preset: presetSchema,

  /** 프로젝트에서 프리셋 값을 덮어쓴 것들 */
  intervals: intervalsSchema,
  tts: ttsSettingsSchema,
  caption: captionStyleSchema,
  effects: effectSettingsSchema,
  image: imageStyleSchema,

  title: z.string().default(""),
  summary: z.string().default(""),
  description: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
  thumbnailPrompt: z.string().default(""),

  sections: z.array(scriptSectionSchema),
  lines: z.array(scriptLineSchema),
  scenes: z.array(sceneSchema),

  /** 끝난 단계들 */
  done: z.array(z.enum(STEPS)).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

/** 한국어 기준 초당 약 5.8자 — 음성 생성 전 길이 추정에 쓴다. */
export const CHARS_PER_SECOND_KO = 5.8;

export const estimateDurationSec = (text: string): number =>
  Math.max(0.6, [...text.trim()].length / CHARS_PER_SECOND_KO);

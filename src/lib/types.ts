import { z } from "zod";

/**
 * 이 파일이 앱 전체의 계약이다.
 *
 * 핵심 개념: 프리셋("스타일")이 결과물의 핏을 잠근다.
 * 사용자는 주제 + 프리셋만 고르고, 화면비·컷 길이·화풍·말투·자막은
 * 전부 프리셋에서 결정된다. 그래서 매번 같은 핏으로 나온다.
 */

export const ASPECTS = ["9:16", "16:9", "1:1"] as const;
export type Aspect = (typeof ASPECTS)[number];

export const ASPECT_RESOLUTION: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

/** 컷을 어떻게 채울지. 프리셋이 기본값을 주고, 컷마다 덮어쓸 수 있다. */
export const CUT_MODES = ["image", "video"] as const;
export type CutMode = (typeof CUT_MODES)[number];

export const TTS_PROVIDERS = [
  "elevenlabs",
  "typecast",
  "google-ai-studio",
  "google-cloud",
  "manual",
] as const;
export type TtsProviderId = (typeof TTS_PROVIDERS)[number];

export const IMAGE_PROVIDERS = ["gemini", "openai", "manual"] as const;
export type ImageProviderId = (typeof IMAGE_PROVIDERS)[number];

export const VIDEO_PROVIDERS = ["gemini-veo", "manual"] as const;
export type VideoProviderId = (typeof VIDEO_PROVIDERS)[number];

// ─────────────────────────────────────────────────────────────
// 프리셋 (= 스타일)
// ─────────────────────────────────────────────────────────────

export const presetSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),

  /** 화면비 — 해상도는 여기서 파생된다 */
  aspect: z.enum(ASPECTS),
  fps: z.number().int().min(24).max(60).default(30),

  /** 영상 전체 목표 길이(초). 컷 개수는 여기서 역산된다 */
  targetDurationSec: z.number().int().min(15).max(1800),
  cutDurationSec: z.object({
    min: z.number().min(0.5),
    max: z.number().min(0.5),
  }),

  script: z.object({
    language: z.string().default("ko"),
    /** 화자 설정. 대본 말투를 잠근다 */
    persona: z.string().default(""),
    tone: z.string().default(""),
    /** 대본 총 글자수 범위 (한국어 기준 분당 약 350자) */
    charCount: z.object({ min: z.number().int(), max: z.number().int() }),
    /** 구성 뼈대. 컷은 이 순서를 따라 배치된다 */
    structure: z.array(z.string()).min(1),
    /** 이 스타일에서 금지할 것들 */
    avoid: z.array(z.string()).default([]),
  }),

  image: z.object({
    provider: z.enum(IMAGE_PROVIDERS).default("manual"),
    model: z.string().default(""),
    /** 모든 컷 이미지 프롬프트 뒤에 붙는 화풍 고정 문구 */
    stylePrompt: z.string().default(""),
    negativePrompt: z.string().default(""),
  }),

  video: z.object({
    /** 컷 기본 모드. 컷별로 바꿀 수 있다 */
    defaultMode: z.enum(CUT_MODES).default("image"),
    provider: z.enum(VIDEO_PROVIDERS).default("manual"),
    model: z.string().default(""),
    /** image 모드 컷에 걸리는 켄번즈 줌 (캡컷 키프레임으로 나간다) */
    kenBurns: z.object({
      enabled: z.boolean().default(true),
      /** 1.0 = 원본, 1.12 = 12% 확대 */
      scaleFrom: z.number().default(1.0),
      scaleTo: z.number().default(1.12),
    }),
    transition: z.object({
      type: z.string().default("none"),
      durationSec: z.number().default(0.3),
    }),
  }),

  tts: z.object({
    provider: z.enum(TTS_PROVIDERS).default("manual"),
    voiceId: z.string().default(""),
    /** 어댑터가 각자 자기 범위로 매핑한다 */
    speed: z.number().default(1.0),
    pitch: z.number().default(0),
  }),

  caption: z.object({
    enabled: z.boolean().default(true),
    /** 컷별 화면 자막을 대본에서 뽑을지, 나레이션 전체를 깔지 */
    source: z.enum(["onScreenText", "narration"]).default("onScreenText"),
    fontSize: z.number().default(12),
    position: z.enum(["top", "center", "bottom"]).default("bottom"),
  }),

  createdAt: z.string(),
  updatedAt: z.string(),
  /** 기본 제공 프리셋은 삭제 대신 복제해서 쓰게 한다 */
  builtin: z.boolean().default(false),
});

export type Preset = z.infer<typeof presetSchema>;

/** 프리셋 생성/수정 입력 — id·타임스탬프는 서버가 채운다 */
export const presetInputSchema = presetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  builtin: true,
});
export type PresetInput = z.infer<typeof presetInputSchema>;

// ─────────────────────────────────────────────────────────────
// 기획 결과 (Claude가 채우는 부분)
// ─────────────────────────────────────────────────────────────

/**
 * Claude 구조화 출력용 스키마.
 * 여기에는 기본값·optional을 쓰지 않는다 — 구조화 출력은 모든 필드를
 * 명시적으로 요구할 때 가장 안정적이다.
 */
export const cutPlanSchema = z.object({
  /** 프리셋 structure 중 이 컷이 속한 파트 */
  section: z.string(),
  /** 성우가 읽을 문장 */
  narration: z.string(),
  /** 이 컷의 화면 길이(초) */
  durationSec: z.number(),
  /** 이미지 생성기에 그대로 넣을 영문 프롬프트 */
  imagePrompt: z.string(),
  /** 사람이 읽는 한국어 이미지 설명 — 왜 이 그림인지 */
  imageDescription: z.string(),
  /** video 모드일 때 카메라·피사체 움직임 지시 */
  motionPrompt: z.string(),
  /** 화면에 박히는 짧은 자막 문구 */
  onScreenText: z.string(),
});

export const planSchema = z.object({
  title: z.string(),
  hook: z.string(),
  summary: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  thumbnailPrompt: z.string(),
  cuts: z.array(cutPlanSchema),
});

export type CutPlan = z.infer<typeof cutPlanSchema>;
export type Plan = z.infer<typeof planSchema>;

// ─────────────────────────────────────────────────────────────
// 프로젝트 (기획 + 에셋 상태)
// ─────────────────────────────────────────────────────────────

export const assetRefSchema = z.object({
  /** data 디렉터리 기준 상대 경로 */
  path: z.string(),
  provider: z.string(),
  createdAt: z.string(),
});
export type AssetRef = z.infer<typeof assetRefSchema>;

export const cutSchema = cutPlanSchema.extend({
  id: z.string(),
  index: z.number().int(),
  /** 컷별로 image / video 선택 — 프리셋 기본값에서 시작한다 */
  mode: z.enum(CUT_MODES),
  image: assetRefSchema.nullable(),
  video: assetRefSchema.nullable(),
  audio: assetRefSchema.nullable(),
  /** 사용자가 컷을 손댔으면 재생성 시 덮어쓰지 않는다 */
  locked: z.boolean(),
});
export type Cut = z.infer<typeof cutSchema>;

export const projectSchema = z.object({
  id: z.string(),
  topic: z.string(),
  /** 추가 지시사항 — 이번 영상에만 적용 */
  brief: z.string(),
  presetId: z.string(),
  /**
   * 생성 시점의 프리셋 사본.
   * 프리셋을 나중에 고쳐도 이미 만든 프로젝트가 흔들리지 않게 한다.
   */
  preset: presetSchema,
  plan: planSchema.nullable(),
  cuts: z.array(cutSchema),
  status: z.enum(["draft", "planned", "generating", "ready"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

/** 한국어 기준 대략 분당 350자 — 목표 길이에서 대본 분량을 역산한다 */
export const CHARS_PER_MINUTE_KO = 350;

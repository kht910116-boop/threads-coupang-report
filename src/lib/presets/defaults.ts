import type { Preset } from "@/lib/types";

/**
 * 기본 프리셋.
 *
 * 시작점이지 정답이 아니다. 화면에서 복제·수정·추가하면 data/presets.json에 쌓인다.
 * 여기 배열에 항목을 더하면 다음 실행 때 새 기본 프리셋으로 합류한다
 * (이미 있는 id는 덮어쓰지 않는다).
 */

type Seed = Omit<Preset, "id" | "createdAt" | "updatedAt" | "builtin">;

/** 모든 이미지 프롬프트 뒤에 공통으로 붙는 문구. */
const COMMON_SUFFIX =
  "Single still frame, no panels, no overlaid subtitles or title cards. No watermark. If any text appears, it must be Korean only.";

export const DEFAULT_PRESETS: Array<{ id: string } & Seed> = [
  {
    id: "whiteboard-doc",
    name: "화이트보드 · 다큐 해설",
    description:
      "손그림 스케치 화풍의 정보 해설. 한 장면에 강조색 하나만 살려 시선을 끈다.",
    aspect: "16:9",
    fps: 30,
    targetDurationSec: 180,
    script: {
      language: "ko",
      persona: "근거를 먼저 대고 결론을 내리는 해설자",
      tone: "차분한 존댓말. 한 문장에 한 가지만.",
      partCount: 4,
      charsPerLine: { min: 18, max: 32 },
      avoid: ["단정적 예측", "감정적 수사", "출처 불명 수치"],
    },
    intervals: {
      hookIntro: { min: 8, max: 13 },
      part: { min: 12, max: 22 },
      closing: { min: 12, max: 22 },
    },
    image: {
      provider: "manual",
      model: "",
      prefix:
        "Hand-drawn minimalist sketch style, whiteboard animation aesthetic, clean ink linework with soft watercolor wash, muted sepia and earth-tone palette, warm aged paper texture background, simple stick-figure characters with round heads, dot eyes and contextual clothing, detailed architectural backgrounds in loose watercolor with isometric perspective, editorial documentary illustration feel, one key focal object per scene in vivid saturated color as a dramatic spotlight against the muted sepia",
      suffix: COMMON_SUFFIX,
      negativePrompt: "text, watermark, photorealistic, cluttered composition",
    },
    video: { defaultMode: "image", provider: "manual", model: "" },
    tts: {
      provider: "manual",
      model: "",
      voiceId: "",
      speed: 1.0,
      pitch: 0,
      leadSilenceMs: 400,
      tailSilenceMs: 700,
      gapMs: 200,
      sectionGapMs: 500,
    },
    caption: {
      enabled: true,
      fontFamily: "Pretendard",
      fontSize: 10,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 0.08,
      position: "bottom",
      marginRatio: 0.1,
      maxCharsPerLine: 24,
    },
    effects: {
      defaultEffect: "fade",
      transitionSec: 0.45,
      kenBurns: { enabled: true, scaleFrom: 1.0, scaleTo: 1.08 },
      rotate: true,
      rotation: ["fade", "dissolve", "zoomIn", "panRight", "zoomOut", "panLeft"],
    },
  },
  {
    id: "shorts-issue",
    name: "쇼츠 · 이슈 훅형",
    description: "세로 45초. 첫 2초에 결론부터 던지고 빠르게 몰아친다.",
    aspect: "9:16",
    fps: 30,
    targetDurationSec: 45,
    script: {
      language: "ko",
      persona: "빠르게 핵심만 찌르는 이슈 채널 진행자",
      tone: "단정적이고 빠름. 짧은 존댓말.",
      partCount: 3,
      charsPerLine: { min: 10, max: 20 },
      avoid: ["장황한 도입", "'오늘은 ~에 대해 알아보겠습니다' 류 상투구"],
    },
    intervals: {
      hookIntro: { min: 2, max: 4 },
      part: { min: 3, max: 6 },
      closing: { min: 3, max: 6 },
    },
    image: {
      provider: "manual",
      model: "",
      prefix:
        "High-contrast editorial photograph, dramatic side lighting, shallow depth of field, muted teal and amber color grade, cinematic vertical composition with generous headroom for on-screen text",
      suffix: COMMON_SUFFIX,
      negativePrompt: "text, watermark, distorted hands, extra fingers, blurry",
    },
    video: { defaultMode: "image", provider: "manual", model: "" },
    tts: {
      provider: "manual",
      model: "",
      voiceId: "",
      speed: 1.08,
      pitch: 0,
      leadSilenceMs: 150,
      tailSilenceMs: 400,
      gapMs: 100,
      sectionGapMs: 250,
    },
    caption: {
      enabled: true,
      fontFamily: "Pretendard",
      fontSize: 15,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 0.1,
      position: "center",
      marginRatio: 0.14,
      maxCharsPerLine: 14,
    },
    effects: {
      defaultEffect: "none",
      transitionSec: 0.2,
      kenBurns: { enabled: true, scaleFrom: 1.0, scaleTo: 1.14 },
      rotate: true,
      rotation: ["none", "zoomIn", "blackFlash", "zoomOut"],
    },
  },
  {
    id: "emotional-vlog",
    name: "감성 · 브이로그",
    description: "세로 60초. 느린 호흡, 여백 많은 화면, 담담한 톤.",
    aspect: "9:16",
    fps: 30,
    targetDurationSec: 60,
    script: {
      language: "ko",
      persona: "혼잣말하듯 담담하게 이야기하는 화자",
      tone: "느린 존댓말. 형용사보다 장면을 말한다.",
      partCount: 3,
      charsPerLine: { min: 12, max: 24 },
      avoid: ["과장된 감탄", "설명조", "정보 나열"],
    },
    intervals: {
      hookIntro: { min: 4, max: 7 },
      part: { min: 6, max: 12 },
      closing: { min: 6, max: 12 },
    },
    image: {
      provider: "manual",
      model: "",
      prefix:
        "35mm film photograph, visible grain, soft diffused window light, desaturated pastel palette, generous negative space, quiet everyday scene, natural candid framing",
      suffix: COMMON_SUFFIX,
      negativePrompt: "text, watermark, harsh flash, crowded composition",
    },
    video: { defaultMode: "image", provider: "manual", model: "" },
    tts: {
      provider: "manual",
      model: "",
      voiceId: "",
      speed: 0.92,
      pitch: -1,
      leadSilenceMs: 600,
      tailSilenceMs: 900,
      gapMs: 320,
      sectionGapMs: 700,
    },
    caption: {
      enabled: true,
      fontFamily: "Pretendard",
      fontSize: 10,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeWidth: 0.06,
      position: "bottom",
      marginRatio: 0.12,
      maxCharsPerLine: 18,
    },
    effects: {
      defaultEffect: "dissolve",
      transitionSec: 0.7,
      kenBurns: { enabled: true, scaleFrom: 1.06, scaleTo: 1.0 },
      rotate: true,
      rotation: ["dissolve", "fade", "blur", "zoomOut"],
    },
  },
];

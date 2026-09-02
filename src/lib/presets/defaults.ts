import type { Preset } from "@/lib/types";

/**
 * 기본 제공 프리셋.
 *
 * 이건 시작점이지 정답이 아니다. UI에서 복제해서 고치거나 새로 만들면
 * data/presets.json에 그대로 쌓인다. 여기 배열에 항목을 추가하면
 * 다음 실행 때 새 기본 프리셋으로 합류한다 (기존 것은 덮어쓰지 않는다).
 */

type Seed = Omit<Preset, "id" | "createdAt" | "updatedAt" | "builtin">;

export const DEFAULT_PRESETS: Array<{ id: string } & Seed> = [
  {
    id: "shorts-issue",
    name: "쇼츠 · 이슈 훅형",
    description: "세로 45초. 첫 2초에 결론부터 던지고 빠르게 몰아치는 컷.",
    aspect: "9:16",
    fps: 30,
    targetDurationSec: 45,
    cutDurationSec: { min: 1.5, max: 3 },
    script: {
      language: "ko",
      persona: "빠르게 핵심만 찌르는 이슈 채널 진행자",
      tone: "단정적이고 빠름. 반말 아님, 짧은 존댓말. 문장은 20자 이내로 끊는다.",
      charCount: { min: 240, max: 320 },
      structure: ["훅", "상황", "핵심", "반전", "마무리"],
      avoid: ["장황한 도입", "'오늘은 ~에 대해 알아보겠습니다' 류 상투구", "출처 불명 수치"],
    },
    image: {
      provider: "manual",
      model: "",
      stylePrompt:
        "high-contrast editorial photo, dramatic side lighting, shallow depth of field, muted teal and amber grade, cinematic 9:16 vertical composition, subject centered with generous headroom for on-screen text",
      negativePrompt: "text, watermark, logo, distorted hands, extra fingers, blurry",
    },
    video: {
      defaultMode: "image",
      provider: "manual",
      model: "",
      kenBurns: { enabled: true, scaleFrom: 1.0, scaleTo: 1.14 },
      transition: { type: "none", durationSec: 0 },
    },
    tts: { provider: "manual", voiceId: "", speed: 1.08, pitch: 0 },
    caption: { enabled: true, source: "onScreenText", fontSize: 14, position: "center" },
  },
  {
    id: "info-longform",
    name: "정보 · 롱폼 해설",
    description: "가로 3분. 차분한 해설 톤, 컷이 길고 자료 화면이 많다.",
    aspect: "16:9",
    fps: 30,
    targetDurationSec: 180,
    cutDurationSec: { min: 4, max: 8 },
    script: {
      language: "ko",
      persona: "근거를 먼저 대고 결론을 내리는 해설자",
      tone: "차분한 존댓말. 한 문단에 한 가지 논점만.",
      charCount: { min: 950, max: 1150 },
      structure: ["도입", "배경", "쟁점1", "쟁점2", "반론", "정리", "제언"],
      avoid: ["단정적 예측", "감정적 수사", "근거 없는 수치"],
    },
    image: {
      provider: "manual",
      model: "",
      stylePrompt:
        "clean documentary still, natural daylight, neutral color grade, 16:9 wide composition, journalistic framing, no on-image text",
      negativePrompt: "text, watermark, cartoon, oversaturated, distorted anatomy",
    },
    video: {
      defaultMode: "image",
      provider: "manual",
      model: "",
      kenBurns: { enabled: true, scaleFrom: 1.0, scaleTo: 1.08 },
      transition: { type: "fade", durationSec: 0.4 },
    },
    tts: { provider: "manual", voiceId: "", speed: 1.0, pitch: 0 },
    caption: { enabled: true, source: "narration", fontSize: 10, position: "bottom" },
  },
  {
    id: "emotional-vlog",
    name: "감성 · 브이로그",
    description: "세로 60초. 느린 호흡, 여백 많은 화면, 속삭이는 톤.",
    aspect: "9:16",
    fps: 30,
    targetDurationSec: 60,
    cutDurationSec: { min: 3, max: 6 },
    script: {
      language: "ko",
      persona: "혼잣말하듯 담담하게 이야기하는 화자",
      tone: "느린 존댓말. 여백을 두고 짧게 끊는다. 형용사보다 장면을 말한다.",
      charCount: { min: 280, max: 360 },
      structure: ["장면", "감정", "기억", "전환", "여운"],
      avoid: ["과장된 감탄", "설명조", "정보 나열"],
    },
    image: {
      provider: "manual",
      model: "",
      stylePrompt:
        "film photograph, 35mm grain, soft diffused window light, desaturated pastel palette, generous negative space, quiet everyday scene, vertical 9:16",
      negativePrompt: "text, watermark, harsh flash, crowded composition, people looking at camera",
    },
    video: {
      defaultMode: "image",
      provider: "manual",
      model: "",
      kenBurns: { enabled: true, scaleFrom: 1.05, scaleTo: 1.0 },
      transition: { type: "fade", durationSec: 0.6 },
    },
    tts: { provider: "manual", voiceId: "", speed: 0.92, pitch: -1 },
    caption: { enabled: true, source: "onScreenText", fontSize: 10, position: "bottom" },
  },
  {
    id: "anim-storytelling",
    name: "애니메이션 · 스토리텔링",
    description: "세로 90초. 일러스트 화풍으로 이야기를 끌고 간다.",
    aspect: "9:16",
    fps: 30,
    targetDurationSec: 90,
    cutDurationSec: { min: 2.5, max: 5 },
    script: {
      language: "ko",
      persona: "이야기를 들려주는 내레이터",
      tone: "존댓말 구어체. 인물과 사건 중심. 현재형으로 끌고 간다.",
      charCount: { min: 480, max: 580 },
      structure: ["발단", "전개", "위기", "절정", "결말"],
      avoid: ["교훈 설교", "요약 남발", "시점 혼동"],
    },
    image: {
      provider: "manual",
      model: "",
      stylePrompt:
        "2D animation still, clean vector-ish linework, flat cel shading, limited 5-color palette, expressive character silhouettes, vertical 9:16 storyboard frame",
      negativePrompt: "text, watermark, photorealistic, 3d render, cluttered background",
    },
    video: {
      defaultMode: "image",
      provider: "manual",
      model: "",
      kenBurns: { enabled: true, scaleFrom: 1.0, scaleTo: 1.1 },
      transition: { type: "fade", durationSec: 0.25 },
    },
    tts: { provider: "manual", voiceId: "", speed: 1.0, pitch: 0 },
    caption: { enabled: true, source: "onScreenText", fontSize: 12, position: "bottom" },
  },
];

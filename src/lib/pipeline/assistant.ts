import type { Project, Step } from "@/lib/types";
import { SCENE_EFFECTS, CUT_MODES } from "@/lib/types";

/**
 * 고치는 비서.
 *
 * 묻고 답하기만 하던 비서에 **손을 붙인다.** 다만 손이 직접 움직이지는 않는다 —
 * 무엇을 어떻게 바꿀지 제안하고, 사용자가 보고 누르면 그때 바뀐다.
 *
 * 승인 단계를 두는 이유는 되돌리기가 없기 때문이다. 455줄짜리 대본을 비서가
 * 조용히 고쳐놓으면 무엇이 달라졌는지 찾을 방법이 없다. 바꾸기 전과 후를 나란히
 * 보여주는 것이 이 기능의 절반이다.
 *
 * 대상은 **번호로 가리킨다.** id는 uuid라서 모델이 그대로 옮겨 적다가 한 글자만
 * 틀려도 엉뚱한 데가 고쳐지거나 조용히 무시된다. 번호는 모델이 화면에서 보는
 * 것과 같고, 서버가 번호 → id로 옮긴다.
 */

/** 비서가 고칠 수 있는 설정. 여기 없는 것은 못 고친다. */
export const SETTING_PATHS = {
  "intervals.hookIntro.min": "훅·인트로 장면 최소 초",
  "intervals.hookIntro.max": "훅·인트로 장면 최대 초",
  "intervals.part.min": "파트 장면 최소 초",
  "intervals.part.max": "파트 장면 최대 초",
  "intervals.closing.min": "클로징 장면 최소 초",
  "intervals.closing.max": "클로징 장면 최대 초",
  "tts.speed": "말 빠르기 배율",
  "tts.pitch": "목소리 높낮이 (반음)",
  "tts.gapMs": "줄 사이 쉼 (ms)",
  "tts.sectionGapMs": "파트 사이 쉼 (ms)",
  "tts.leadSilenceMs": "영상 앞 무음 (ms)",
  "tts.tailSilenceMs": "영상 뒤 무음 (ms)",
  "caption.maxCharsPerLine": "자막 한 줄 최대 글자수",
} as const;

export type SettingPath = keyof typeof SETTING_PATHS;

export interface Edit {
  target: "line" | "scene" | "setting";
  /** line·scene일 때: 화면에 보이는 번호(1부터). setting일 때는 안 쓴다. */
  number?: number;
  field: string;
  value: string;
  /** 왜 이렇게 고치는지 한 줄. 사용자가 승인 여부를 판단할 근거다. */
  why: string;
}

const LINE_FIELDS = ["text", "spokenText"];
const SCENE_FIELDS = ["summaryKo", "prompt", "motionPrompt", "effect", "mode"];

/** 모델에게 시킬 출력 형태. CLI가 스키마 플래그를 받으면 그대로 넘어간다. */
export const ASSISTANT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "edits"],
  properties: {
    answer: {
      type: "string",
      description: "사용자에게 할 말. 짧게. 고칠 것이 없으면 여기만 채운다.",
    },
    edits: {
      type: "array",
      description:
        "실제로 바꿀 것들. 사용자가 고쳐달라고 하지 않았으면 빈 배열로 둔다.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["target", "field", "value", "why"],
        properties: {
          target: { type: "string", enum: ["line", "scene", "setting"] },
          number: {
            type: "integer",
            description: "자막 줄 번호 또는 장면 번호(1부터). setting이면 생략한다.",
          },
          field: {
            type: "string",
            description: [
              `line: ${LINE_FIELDS.join(" | ")}`,
              `scene: ${SCENE_FIELDS.join(" | ")}`,
              `setting: ${Object.keys(SETTING_PATHS).join(" | ")}`,
            ].join(" / "),
          },
          value: { type: "string", description: "바꿀 값. 숫자도 문자열로 준다." },
          why: { type: "string", description: "이렇게 고치는 이유 한 줄." },
        },
      },
    },
  },
} as const;

export const ASSISTANT_SYSTEM = [
  "당신은 유튜브 영상 제작 도구 안에 붙어 있는 비서다.",
  "사용자는 대본 → 음성 → 스토리보드 → 이미지 → 영상 → 자막·효과 → 캡컷 순으로 작업한다.",
  "",
  "지금 프로젝트 상태가 아래에 주어진다. 그걸 근거로 답한다.",
  "",
  "## 답하는 법",
  "- 짧게 답한다. 사용자는 작업 중이다.",
  "- 모르는 건 모른다고 한다. 프로젝트에 없는 내용을 지어내지 않는다.",
  "- 고칠 곳을 말할 때는 몇 번째 줄·몇 번째 장면인지 짚어준다.",
  "",
  "## 고치는 법",
  "사용자가 고쳐달라고 하면 edits에 담는다. 묻기만 했으면 edits는 빈 배열이다.",
  "",
  "- **번호로 가리킨다.** 아래 목록에 붙은 번호를 그대로 쓴다.",
  "- **바꿀 값 전체를 준다.** '앞부분만' 같은 조각이 아니라 그 칸에 들어갈 최종 글자다.",
  "- **시킨 것만 고친다.** 세 줄을 고쳐달라고 하면 세 줄만 담는다. 지나가다 눈에 띈",
  "  다른 줄을 같이 고치지 않는다 — 사용자가 승인할 때 무엇을 승인하는지 알아야 한다.",
  "- why에는 왜 이렇게 고치는지 한 줄로 적는다. 사용자가 이걸 보고 승인 여부를 정한다.",
  "- 확신이 없으면 고치지 말고 answer로 되묻는다.",
  "",
  "자막 글자(text)와 읽는 글자(spokenText)는 다르다. 자막은 `1,030억 원`이 맞고",
  "음성은 `천삼십억 원`이 맞다. 발음이 문제면 spokenText만 고친다.",
].join("\n");

/** 지금 단계에서 비서가 봐야 할 것. 단계마다 다르다. */
function relevantContent(project: Project, step: Step): string {
  const lines = [...project.lines].sort((a, b) => a.index - b.index);
  const scenes = [...project.scenes].sort((a, b) => a.index - b.index);

  // 대본·구조·음성 단계에서는 자막 줄이 일감이다.
  const wantsLines = ["script", "structure", "tts", "styling"].includes(step);
  // 스토리보드부터는 장면이 일감이다.
  const wantsScenes = ["storyboard", "images", "videos", "styling", "export"].includes(step);

  const out: string[] = [];

  if (wantsLines && lines.length > 0) {
    out.push("", "## 자막 줄 (번호: 글자)");
    for (const line of lines) {
      const spoken = line.spokenText ? `  [읽기: ${line.spokenText}]` : "";
      out.push(`${line.index + 1}: ${line.text}${spoken}`);
    }
  }

  if (wantsScenes && scenes.length > 0) {
    out.push("", "## 장면 (번호: 한글요약)");
    for (const scene of scenes) {
      // 프롬프트는 장면마다 천 자가 넘는다. 아흔다섯 개를 통째로 넣으면
      // 프롬프트가 대본보다 열 배 길어져서 정작 대본이 묻힌다.
      const prompt = scene.prompt.length > 180
        ? `${scene.prompt.slice(0, 180)}…`
        : scene.prompt;
      out.push(
        `${scene.index + 1}: ${scene.summaryKo}` +
          ` (자막 ${scene.lineFrom + 1}~${scene.lineTo + 1}, ${scene.durationSec.toFixed(1)}초,` +
          ` ${scene.mode === "video" ? "영상으로 대체" : "이미지"})`,
        `   프롬프트: ${prompt}`,
      );
    }
  }

  return out.join("\n");
}

export function assistantContext(project: Project, step: Step, stepLabel: string): string {
  const lineCount = project.lines.length;
  const charCount = project.lines.reduce((sum, l) => sum + [...l.text].length, 0);
  const withAudio = project.lines.filter((l) => l.audio).length;
  const withImage = project.scenes.filter((s) => s.image).length;
  const withVideo = project.scenes.filter((s) => s.video).length;

  const head = [
    "## 지금 프로젝트",
    `- 주제: ${project.topic}`,
    project.title ? `- 제목: ${project.title}` : "",
    `- 스타일: ${project.preset.name} (${project.preset.aspect}, 목표 ${project.preset.targetDurationSec}초)`,
    lineCount > 0 ? `- 자막 ${lineCount}줄 / ${charCount}자, 음성 완료 ${withAudio}줄` : "",
    project.scenes.length > 0
      ? `- 장면 ${project.scenes.length}개, 이미지 ${withImage}개, 영상 ${withVideo}개`
      : "",
    `- 장면 간격: 훅·인트로 ${project.intervals.hookIntro.min}~${project.intervals.hookIntro.max}초` +
      ` / 파트 ${project.intervals.part.min}~${project.intervals.part.max}초` +
      ` / 클로징 ${project.intervals.closing.min}~${project.intervals.closing.max}초`,
    `- 말 빠르기 ${project.tts.speed} · 줄 사이 쉼 ${project.tts.gapMs}ms · 자막 한 줄 ${project.caption.maxCharsPerLine}자`,
    `- 지금 보고 있는 단계: ${stepLabel}`,
  ].filter((l) => l !== "");

  return head.join("\n") + relevantContent(project, step);
}

/** 모델이 낸 제안을 실제로 쓸 수 있는 것만 남긴다. */
export function validateEdits(
  project: Project,
  edits: Edit[],
): { ok: Array<Edit & { id?: string; before: string }>; rejected: string[] } {
  const ok: Array<Edit & { id?: string; before: string }> = [];
  const rejected: string[] = [];

  const lineByNumber = new Map(project.lines.map((l) => [l.index + 1, l]));
  const sceneByNumber = new Map(project.scenes.map((s) => [s.index + 1, s]));

  for (const edit of edits) {
    if (edit.target === "line") {
      const line = lineByNumber.get(edit.number ?? -1);
      if (!line) {
        rejected.push(`${edit.number}번 자막 줄이 없습니다.`);
        continue;
      }
      if (!LINE_FIELDS.includes(edit.field)) {
        rejected.push(`자막 줄에 "${edit.field}" 칸은 없습니다.`);
        continue;
      }
      const before = edit.field === "text" ? line.text : line.spokenText;
      // 이미 그 값이면 제안할 것이 없다. 목록만 길어진다.
      if (before.trim() === edit.value.trim()) continue;
      ok.push({ ...edit, id: line.id, before });
      continue;
    }

    if (edit.target === "scene") {
      const scene = sceneByNumber.get(edit.number ?? -1);
      if (!scene) {
        rejected.push(`${edit.number}번 장면이 없습니다.`);
        continue;
      }
      if (!SCENE_FIELDS.includes(edit.field)) {
        rejected.push(`장면에 "${edit.field}" 칸은 없습니다.`);
        continue;
      }
      if (edit.field === "effect" && !SCENE_EFFECTS.includes(edit.value as never)) {
        rejected.push(`"${edit.value}"는 없는 효과입니다.`);
        continue;
      }
      if (edit.field === "mode" && !CUT_MODES.includes(edit.value as never)) {
        rejected.push(`"${edit.value}"는 없는 모드입니다.`);
        continue;
      }
      const before = String((scene as unknown as Record<string, unknown>)[edit.field] ?? "");
      if (before.trim() === edit.value.trim()) continue;
      ok.push({ ...edit, id: scene.id, before });
      continue;
    }

    if (!(edit.field in SETTING_PATHS)) {
      rejected.push(`"${edit.field}"는 비서가 고칠 수 있는 설정이 아닙니다.`);
      continue;
    }
    if (!Number.isFinite(Number(edit.value))) {
      rejected.push(`${edit.field}에는 숫자가 필요한데 "${edit.value}"가 왔습니다.`);
      continue;
    }
    const before = String(
      edit.field
        .split(".")
        .reduce<unknown>(
          (acc, key) =>
            acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
          project,
        ) ?? "",
    );
    if (before === edit.value) continue;
    ok.push({ ...edit, before });
  }

  return { ok, rejected };
}

/**
 * 프로젝트가 없을 때 비서에게 주는 배경.
 *
 * 첫 화면에서 묻는 말은 프로젝트 안에서 묻는 말과 다르다. "7번 줄 고쳐줘"가
 * 아니라 "이거 어떻게 쓰는 거냐"다. 그래서 대본 대신 **앱 자체**를 설명한다.
 */
export const APP_GUIDE = [
  "당신은 '오토튜브'라는 유튜브 영상 제작 도구 안에 붙어 있는 비서다.",
  "사용자는 아직 프로젝트를 열지 않았다. 앱 사용법이나 만들 영상에 대해 묻는 중이다.",
  "",
  "## 이 앱이 하는 일",
  "주제를 넣으면 대본을 쓰고, 자막 줄로 쪼개고, 음성을 만들고, 장면으로 묶고,",
  "장면마다 그림 설명을 쓰고, 캡컷 프로젝트로 내보낸다. 8단계다.",
  "",
  "1. 대본 — AI로 쓰거나 직접 붙여넣는다",
  "2. 구조 — 훅·인트로·파트·클로징으로 나눈다",
  "3. 음성 — 줄마다 TTS. 발음 검수(1,030억 → 천삼십억)가 여기 있다",
  "4. 스토리보드 — 음성 길이 합으로 줄을 장면에 묶고 그림 설명을 쓴다",
  "5. 이미지 — 장면마다 그림. 엑셀로 받아 플로우에서 만들고 일괄 업로드한다",
  "6. 영상화 — 5단계 이미지가 그대로 오고, 고른 장면만 영상으로 대체한다",
  "7. 자막·효과 — 자막 모양과 장면 전환",
  "8. 캡컷 — 드래프트 폴더로 내보낸다",
  "",
  "## 알아둘 것",
  "- **구독으로 쓴다.** API 키를 쓰지 않는 것이 원칙이다(구글 무료 한도만 예외).",
  "  AI는 구독 CLI(claude·codex·grok)나 로그인된 웹으로 돈다.",
  "- 스타일 프리셋이 영상 길이·화면 비율·장면 간격·화풍을 한꺼번에 정한다.",
  "  롱폼·미들폼·숏폼·쇼핑쇼츠 등이 있다.",
  "- 이미지와 영상은 **반자동**이다. 앱이 엑셀을 주면 사용자가 플로우·그록에서",
  "  만들어 와서 한꺼번에 올린다.",
  "",
  "## 답하는 법",
  "- 짧게 답한다. 사용자는 작업 중이다.",
  "- 모르는 건 모른다고 한다. 이 앱에 없는 기능을 있는 것처럼 말하지 않는다.",
  "- 어느 단계에서 무엇을 누르면 되는지 짚어준다.",
].join("\n");

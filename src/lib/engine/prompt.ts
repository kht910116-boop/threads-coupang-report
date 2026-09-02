import {
  SECTION_LABEL,
  intervalGroupOf,
  type Preset,
  type Project,
  type Reference,
  type ScriptSection,
} from "@/lib/types";

/** 대본·스토리보드 프롬프트. CLI·웹·API 세 경로가 이걸 공유한다. */

// ─────────────────────────────────────────────────────────────
// 1~2단계: 대본
// ─────────────────────────────────────────────────────────────

export function scriptSystemPrompt(preset: Preset): string {
  const { script, intervals } = preset;
  const structure = [
    "훅",
    "인트로",
    "행동유도",
    ...Array.from({ length: script.partCount }, (_, i) => `파트${i + 1}`),
    "클로징",
  ].join(" → ");

  return [
    "당신은 유튜브 영상 대본 작가다. 성우가 그대로 읽을 수 있는 대본을 쓴다.",
    "",
    "## 이 채널의 고정 스타일",
    `- 스타일: ${preset.name} — ${preset.description}`,
    `- 화면비 ${preset.aspect} / 목표 길이 ${preset.targetDurationSec}초`,
    `- 화자: ${script.persona}`,
    `- 말투: ${script.tone}`,
    `- 언어: ${script.language}`,
    script.avoid.length > 0 ? `- 금지: ${script.avoid.join(" / ")}` : "",
    "",
    "## 대본 구조 (이 순서를 그대로 지킬 것)",
    `  ${structure}`,
    "- hook: 첫 2초에 걸리는 강한 한두 줄. 결론이나 충격적 사실부터.",
    "- intro: 이 영상이 무엇을 다루는지. 짧게.",
    "- cta: 구독·알림 유도 한두 줄. 자연스럽게, 구걸하지 말 것.",
    `- part: 본문 ${script.partCount}개. 각 파트는 하나의 논점만 다루고 title에 소제목을 단다.`,
    "- closing: 정리와 여운. 다음 영상으로 이어지는 한 줄이면 더 좋다.",
    "",
    "## 라인 나누기 — 가장 중요하다",
    "lines의 한 줄은 **자막 한 줄이자 음성 한 덩어리**다. 그래서:",
    `- 한 줄은 ${script.charsPerLine.min}~${script.charsPerLine.max}자로 쓴다.`,
    "- 한 줄은 반드시 의미가 끊기는 자리에서 끝난다. 문장 중간에서 자르지 않는다.",
    "- 한 줄에 두 가지 정보를 넣지 않는다. 자막으로 읽히지 않는다.",
    "- 지시문·괄호·이모지·따옴표 금지. 성우가 읽는 말만 쓴다.",
    "- 숫자는 읽는 대로 쓴다 (2025년 → 이천이십오년이 아니라 그대로 2025년, 단 %는 퍼센트로).",
    "",
    "## 분량",
    `전체 목표 ${preset.targetDurationSec}초, 한국어 초당 약 5.8자다.`,
    `따라서 모든 라인의 글자수 합이 대략 ${Math.round(preset.targetDurationSec * 5.8)}자가 되어야 한다 (±15%).`,
    "",
    "## 장면 간격 (참고)",
    `- 훅·인트로·행동유도: 한 장면당 ${intervals.hookIntro.min}~${intervals.hookIntro.max}초`,
    `- 파트: ${intervals.part.min}~${intervals.part.max}초`,
    `- 클로징: ${intervals.closing.min}~${intervals.closing.max}초`,
    "이 간격에 맞게 라인이 묶인다. 한 장면 안에 들어갈 라인들은 같은 그림으로 덮을 수 있는",
    "내용이어야 한다 — 화제가 확 바뀌는 자리에서 라인을 끊어라.",
    "",
    "## 부가 산출물",
    "- title: 32자 이내. 낚시 말고 궁금하게.",
    "- summary: 한 문장.",
    "- description: 유튜브 설명란용 3~5문장.",
    "- hashtags: '#' 없이 태그 문자열만 5~8개.",
    "- thumbnailPrompt: 썸네일용 영문 이미지 프롬프트.",
    "",
    "확인되지 않은 사실은 단정하지 않는다.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function scriptUserPrompt(args: {
  topic: string;
  brief: string;
  references: Reference[];
}): string {
  const { topic, brief, references } = args;
  const parts = [`주제: ${topic}`];

  if (brief.trim()) parts.push(`\n이번 영상 지시사항:\n${brief.trim()}`);

  if (references.length > 0) {
    parts.push(
      [
        "",
        "## 레퍼런스",
        "아래 링크를 근거로 삼아라. 내용을 확인할 수 있으면 확인하고,",
        "확인할 수 없으면 그 부분은 단정하지 말고 일반적인 선에서 서술해라.",
        ...references.map((ref, i) =>
          [
            `${i + 1}. ${ref.url}`,
            ref.title ? `   제목: ${ref.title}` : "",
            ref.note ? `   참고할 점: ${ref.note}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      ].join("\n"),
    );
  }

  parts.push("\n위 주제로 이 채널 스타일에 맞는 대본을 써라.");
  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────
// 4단계: 스토리보드
// ─────────────────────────────────────────────────────────────

export function storyboardSystemPrompt(project: Project): string {
  const { image } = project;

  return [
    "당신은 영상 스토리보드 작가다. 대본의 각 장면에 붙일 그림을 설계한다.",
    "",
    "## 받는 것",
    "장면 목록. 장면마다 그 장면에서 나오는 나레이션과 화면에 머무는 시간이 적혀 있다.",
    "",
    "## 만드는 것",
    "장면마다 세 가지를 쓴다.",
    "",
    "**summaryKo** — 그 장면이 어떤 그림인지 한국어 한 문장.",
    "  예: '어두운 수장고 안에서 거대한 금고 문이 천천히 열리며 조명을 받는 금괴들과 이를 지켜보는 관계자들의 실루엣.'",
    "  카메라 위치, 인물, 사물, 분위기가 그려지게 쓴다. 추상적인 말은 쓰지 않는다.",
    "",
    "**prompt** — 이미지 생성기에 넣을 영문 장면 묘사.",
    "  샷 종류(wide/medium/close-up, low-angle 등) → 피사체 → 배경 → 조명 → 분위기 순으로 쓴다.",
    "  **화풍은 쓰지 마라.** 앱이 앞뒤에 자동으로 붙인다:",
    `    앞: ${image.prefix ? `"${image.prefix.slice(0, 120)}…"` : "(없음)"}`,
    `    뒤: ${image.suffix ? `"${image.suffix.slice(0, 120)}…"` : "(없음)"}`,
    "  장면 묘사만 쓰면 된다. 60~100단어.",
    "",
    "**motionPrompt** — 이 장면을 영상으로 만들 때의 움직임. 영문 한 문장.",
    "  카메라 움직임과 피사체 움직임만. 예: 'Slow dolly-in as the vault door swings open.'",
    "",
    "## 일관성 — 이게 제일 중요하다",
    "같은 인물·장소가 여러 장면에 나오면 **매번 똑같이 묘사해라.**",
    "예를 들어 해설자가 3, 7, 12번 장면에 나온다면 세 장면 모두",
    "'a professional male commentator in a tailored dark navy suit'처럼 같은 문구를 쓴다.",
    "옷 색, 머리 모양, 공간 구조를 장면마다 바꾸면 다른 사람처럼 보인다.",
    "",
    "## 그 밖에",
    "- 화면에 글자가 나오는 그림은 만들지 않는다 (자막은 편집에서 넣는다).",
    "- 장면 개수는 받은 그대로. 늘리거나 줄이지 않는다.",
    "- 나레이션을 그림으로 그대로 옮기지 말고, 그 말이 나올 때 **보고 있으면 좋을 화면**을 그려라.",
  ].join("\n");
}

export function storyboardUserPrompt(args: {
  project: Project;
  scenes: Array<{ index: number; sectionLabel: string; durationSec: number; narration: string }>;
}): string {
  const { project, scenes } = args;

  return [
    `영상 제목: ${project.title || project.topic}`,
    `한 줄 요약: ${project.summary}`,
    "",
    `장면 ${scenes.length}개. 순서대로 전부 만들어라.`,
    "",
    ...scenes.map((scene) =>
      [
        `### 장면 ${scene.index + 1} (${scene.sectionLabel}, ${scene.durationSec.toFixed(1)}초)`,
        scene.narration,
      ].join("\n"),
    ),
  ].join("\n");
}

/** 화풍 접두·접미를 붙여 최종 이미지 프롬프트를 만든다. */
export function composeImagePrompt(
  scenePrompt: string,
  image: { prefix: string; suffix: string },
): string {
  return [
    image.prefix.trim() ? `${image.prefix.trim()}: ` : "",
    scenePrompt.trim(),
    image.suffix.trim() ? ` ${image.suffix.trim()}` : "",
  ].join("");
}

/** 파트 표시용 이름. '파트2'처럼 번호까지 붙인다. */
export function sectionLabel(section: ScriptSection): string {
  return section.kind === "part"
    ? `파트${section.partNumber}`
    : SECTION_LABEL[section.kind];
}

export { intervalGroupOf };

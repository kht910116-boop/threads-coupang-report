import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { planSchema, type Plan, type Preset } from "@/lib/types";

/**
 * 기획 엔진. 주제 + 프리셋 → 대본 구성 · 컷 분할 · 이미지 프롬프트 · 스토리보드.
 *
 * 프리셋을 system에, 주제를 user에 둔다. 같은 프리셋으로 여러 편을 뽑을 때
 * system 프리픽스가 그대로라 프롬프트 캐시가 걸린다.
 */

const MODEL = "claude-opus-5";

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY가 없습니다. .env.local에 넣고 서버를 다시 시작하세요.",
    );
  }
  // 적응형 사고가 붙으면 한 요청이 몇 분까지 갈 수 있다.
  return new Anthropic({ timeout: 10 * 60 * 1000 });
}

/** 목표 길이와 컷 길이 범위에서 컷 개수 범위를 역산한다. */
export function cutCountRange(preset: Preset): { min: number; max: number } {
  const { targetDurationSec, cutDurationSec } = preset;
  return {
    min: Math.max(3, Math.floor(targetDurationSec / cutDurationSec.max)),
    max: Math.max(4, Math.ceil(targetDurationSec / cutDurationSec.min)),
  };
}

function systemPrompt(preset: Preset): string {
  const { min, max } = cutCountRange(preset);
  const res = preset.aspect;

  return [
    "당신은 유튜브 영상 기획자다. 주제를 받아 촬영·편집이 바로 가능한 컷 단위 기획서를 만든다.",
    "",
    "## 이 채널의 고정 스타일 (절대 벗어나지 말 것)",
    `- 스타일 이름: ${preset.name}`,
    `- 성격: ${preset.description}`,
    `- 화면비: ${res} / 목표 길이: ${preset.targetDurationSec}초`,
    `- 컷 길이: ${preset.cutDurationSec.min}~${preset.cutDurationSec.max}초`,
    `- 컷 개수: ${min}~${max}개`,
    `- 화자: ${preset.script.persona}`,
    `- 말투: ${preset.script.tone}`,
    `- 언어: ${preset.script.language}`,
    `- 나레이션 총 글자수: ${preset.script.charCount.min}~${preset.script.charCount.max}자`,
    `- 구성 뼈대: ${preset.script.structure.join(" → ")}`,
    preset.script.avoid.length > 0
      ? `- 금지: ${preset.script.avoid.join(" / ")}`
      : "",
    "",
    "## 지켜야 할 제약",
    `1. 모든 컷의 durationSec 합계는 ${preset.targetDurationSec}초의 ±10% 안에 들어와야 한다.`,
    `2. 각 컷의 durationSec은 ${preset.cutDurationSec.min}~${preset.cutDurationSec.max} 사이여야 한다.`,
    "3. narration은 해당 컷 길이 안에 읽히는 분량이어야 한다 (한국어 기준 초당 약 5.8자).",
    `4. section은 반드시 구성 뼈대 중 하나여야 한다: ${preset.script.structure.join(", ")}`,
    "5. 구성 뼈대는 순서대로 전부 등장해야 하고, 한 파트에 여러 컷이 들어가도 된다.",
    "",
    "## 각 필드 작성 규칙",
    "- narration: 성우가 그대로 읽는 문장. 지시문·괄호·이모지 금지.",
    "- imagePrompt: 이미지 생성기에 넣을 **영문** 프롬프트. 장면·구도·조명·피사체를 구체적으로.",
    `  화풍은 이미 고정돼 있으니 반복하지 말고 장면 내용만 써라. (고정 화풍: ${preset.image.stylePrompt || "지정 없음"})`,
    "- imageDescription: 그 그림이 어떤 장면이고 왜 이 컷에 붙는지 한국어 한두 문장.",
    "- motionPrompt: 그 컷을 AI 영상으로 뽑을 때의 카메라·피사체 움직임. 영문 한 문장.",
    "- onScreenText: 화면에 박히는 자막. 12자 이내의 짧은 문구. 나레이션을 그대로 베끼지 말고 핵심어만.",
    "",
    "## 부가 산출물",
    "- title: 클릭을 부르되 낚시가 아닌 제목. 32자 이내.",
    "- hook: 첫 2초에 나갈 한 문장.",
    "- summary: 이 영상이 무엇인지 한 문장.",
    "- description: 유튜브 설명란에 넣을 3~5문장.",
    "- hashtags: '#' 없이 태그 문자열만 5~8개.",
    "- thumbnailPrompt: 썸네일용 영문 이미지 프롬프트.",
    "",
    "사실관계가 불확실한 내용은 단정하지 말고, 확인 가능한 선에서만 서술한다.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export async function generatePlan(args: {
  preset: Preset;
  topic: string;
  brief: string;
}): Promise<Plan> {
  const { preset, topic, brief } = args;

  const userContent = [
    `주제: ${topic}`,
    brief.trim() ? `\n이번 영상 추가 지시사항:\n${brief.trim()}` : "",
    "\n위 주제로 이 채널 스타일에 맞는 컷 단위 기획서를 만들어라.",
  ].join("");

  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    // 프리셋은 편마다 그대로라 캐시 프리픽스로 쓴다.
    system: [
      {
        type: "text",
        text: systemPrompt(preset),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(planSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `모델이 이 주제에 대한 생성을 거부했습니다: ${response.stop_details?.explanation ?? "사유 미상"}`,
    );
  }
  if (!response.parsed_output) {
    throw new Error(
      response.stop_reason === "max_tokens"
        ? "출력이 길이 제한에 걸렸습니다. 목표 길이를 줄이거나 컷 길이를 늘려보세요."
        : "기획 결과를 해석하지 못했습니다. 다시 시도해 주세요.",
    );
  }
  return response.parsed_output;
}

/** 컷 하나만 다시 뽑는다. 나머지 컷은 건드리지 않는다. */
export async function regenerateCut(args: {
  preset: Preset;
  plan: Plan;
  cutIndex: number;
  instruction: string;
}): Promise<Plan["cuts"][number]> {
  const { preset, plan, cutIndex, instruction } = args;
  const target = plan.cuts[cutIndex];
  if (!target) throw new Error(`${cutIndex}번 컷이 없습니다.`);

  const context = plan.cuts
    .map((cut, i) => `${i === cutIndex ? "▶" : " "} [${i}] (${cut.section}) ${cut.narration}`)
    .join("\n");

  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: systemPrompt(preset),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `영상 제목: ${plan.title}`,
          "",
          "현재 컷 구성 (▶ 표시가 고칠 컷):",
          context,
          "",
          `▶ 컷을 다시 써라. 요청: ${instruction || "더 나은 버전으로"}`,
          "앞뒤 컷과 흐름이 이어져야 하고, 컷 길이 제약은 그대로 지킨다.",
        ].join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(planSchema.shape.cuts.element) },
  });

  if (!response.parsed_output) throw new Error("컷 재생성에 실패했습니다.");
  return response.parsed_output;
}

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { planSchema, type Plan } from "@/lib/types";
import { planUserPrompt, systemPrompt } from "./prompt";
import type { PlannerEngine } from "./types";

/**
 * Anthropic API 경유 기획 엔진 — **API 키 종량제용 경로**.
 *
 * 구독제(Pro/Max)를 쓴다면 이 경로가 아니라 cli.ts를 쓴다.
 * 구독은 API 키를 주지 않는다.
 */

const MODEL = () => process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export const apiEngine: PlannerEngine = {
  id: "api",
  label: "Anthropic API (종량제)",

  async isAvailable() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  unavailableReason() {
    return "ANTHROPIC_API_KEY가 없습니다. 종량제 API 키를 넣거나, 구독제를 쓴다면 Claude Code CLI 엔진을 사용하세요.";
  },

  async generatePlan({ preset, topic, brief }): Promise<Plan> {
    // 적응형 사고가 붙으면 한 요청이 몇 분까지 갈 수 있다.
    const client = new Anthropic({ timeout: 10 * 60 * 1000 });

    const response = await client.messages.parse({
      model: MODEL(),
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
      messages: [{ role: "user", content: planUserPrompt(topic, brief) }],
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
  },
};

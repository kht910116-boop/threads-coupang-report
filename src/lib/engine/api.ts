import Anthropic from "@anthropic-ai/sdk";
import type { Engine } from "./types";

/**
 * Anthropic API 경유 엔진 — 종량제 API 키를 쓸 때만.
 * 구독제라면 CLI나 웹 엔진을 쓴다.
 */

const MODEL = () => process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export const apiEngine: Engine = {
  id: "api",
  label: "Anthropic API (종량제)",
  kind: "api",

  async isAvailable() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  unavailableReason() {
    return "ANTHROPIC_API_KEY가 없습니다. 종량제 API 키를 넣거나, 구독제라면 CLI·웹 엔진을 쓰세요.";
  },

  async complete({ system, user, schema, history }): Promise<string> {
    // 적응형 사고가 붙으면 한 요청이 몇 분까지 갈 수 있다.
    const client = new Anthropic({ timeout: 10 * 60 * 1000 });

    const messages: Anthropic.MessageParam[] = [
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: user },
    ];

    const response = await client.messages.create({
      model: MODEL(),
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      // 시스템 프롬프트는 편마다 그대로라 캐시 프리픽스로 쓴다.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      ...(schema
        ? { output_config: { format: { type: "json_schema" as const, schema } } }
        : {}),
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        `모델이 생성을 거부했습니다: ${response.stop_details?.explanation ?? "사유 미상"}`,
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("출력이 길이 제한에 걸렸습니다. 목표 길이를 줄여보세요.");
    }

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  },
};

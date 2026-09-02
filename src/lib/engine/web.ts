import { z } from "zod";
import { planSchema, type Plan } from "@/lib/types";
import { askWeb, checkLoggedIn } from "@/lib/providers/web/driver";
import type { WebRecipe } from "@/lib/providers/web/recipes";
import { planUserPrompt, systemPrompt } from "./prompt";
import { extractJson } from "./json";
import type { PlannerEngine } from "./types";

/**
 * 구독 웹 서비스를 백그라운드 브라우저로 돌려 기획을 받는 엔진.
 *
 * 웹 UI에는 시스템 프롬프트 자리도, 스키마 플래그도 없다.
 * 그래서 전부 한 덩어리 프롬프트로 합치고, 답변에서 JSON을 건져낸다.
 */
export function makeWebEngine(recipe: WebRecipe): PlannerEngine {
  return {
    id: "web",
    label: recipe.label,

    isAvailable: () => checkLoggedIn(recipe),

    unavailableReason() {
      return `${recipe.label}에 로그인돼 있지 않습니다. 연결 상태 화면에서 '로그인'을 눌러 한 번만 로그인하세요.`;
    },

    async generatePlan({ preset, topic, brief }): Promise<Plan> {
      const { $schema: _drop, ...schema } = z.toJSONSchema(planSchema) as Record<
        string,
        unknown
      >;

      const prompt = [
        systemPrompt(preset),
        "",
        "## 출력 형식 (반드시 지킬 것)",
        "설명·인사말 없이 아래 JSON Schema를 만족하는 **JSON 객체 하나만** 출력한다.",
        "```",
        JSON.stringify(schema),
        "```",
        "",
        "---",
        "",
        planUserPrompt(topic, brief),
      ].join("\n");

      return planSchema.parse(extractJson(await askWeb(recipe, prompt)));
    },
  };
}

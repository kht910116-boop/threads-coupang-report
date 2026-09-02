import { askWeb, checkLoggedIn } from "@/lib/providers/web/driver";
import type { WebRecipe } from "@/lib/providers/web/recipes";
import { flattenHistory, schemaInstruction, type Engine } from "./types";

/**
 * 구독 웹 서비스를 백그라운드 브라우저로 돌리는 엔진.
 *
 * 웹 UI에는 시스템 프롬프트 자리도 스키마 플래그도 없다.
 * 전부 한 덩어리 프롬프트로 합쳐 보낸다.
 */
export function makeWebEngine(recipe: WebRecipe): Engine {
  return {
    id: recipe.id,
    label: recipe.label,
    kind: "web",

    isAvailable: () => checkLoggedIn(recipe),

    unavailableReason() {
      return `${recipe.label}에 로그인돼 있지 않습니다. 연결 상태 화면에서 '로그인'을 눌러 한 번만 로그인하세요.`;
    },

    async complete({ system, user, schema, history }): Promise<string> {
      const prompt = [
        system,
        schema ? schemaInstruction(schema) : "",
        "",
        "---",
        "",
        flattenHistory(history, user),
      ]
        .filter((part) => part !== "")
        .join("\n");

      return askWeb(recipe, prompt);
    },
  };
}

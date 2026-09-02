import { apiEngine } from "./api";
import { cliEngine } from "./cli";
import type { EngineId, PlannerEngine } from "./types";

/**
 * 기획 엔진 선택.
 *
 * 구독제(Claude Pro/Max)는 API 키를 주지 않으므로 Claude Code CLI를 경유한다.
 * 종량제 API 키가 있으면 API를 직접 쓴다.
 *
 * PLANNER_ENGINE=cli | api 로 못박을 수 있고, 비워두면 자동으로 고른다:
 *   API 키가 있으면 api, 없고 CLI가 깔려 있으면 cli.
 */

export const ENGINES: PlannerEngine[] = [cliEngine, apiEngine];

export async function selectEngine(): Promise<PlannerEngine> {
  const forced = process.env.PLANNER_ENGINE as EngineId | undefined;

  if (forced) {
    const engine = ENGINES.find((e) => e.id === forced);
    if (!engine) {
      throw new Error(`PLANNER_ENGINE 값이 잘못됐습니다: ${forced} (api 또는 cli)`);
    }
    if (!(await engine.isAvailable())) throw new Error(engine.unavailableReason());
    return engine;
  }

  if (await apiEngine.isAvailable()) return apiEngine;
  if (await cliEngine.isAvailable()) return cliEngine;

  throw new Error(
    [
      "기획을 만들 방법이 없습니다. 둘 중 하나가 필요합니다:",
      "  · 구독제 — Claude Code CLI를 설치하고 `claude` 실행 후 /login으로 로그인",
      "  · 종량제 — .env.local에 ANTHROPIC_API_KEY 설정",
    ].join("\n"),
  );
}

/** 설정 화면에 보여줄 엔진 상태. */
export async function engineStatus() {
  return Promise.all(
    ENGINES.map(async (engine) => ({
      id: engine.id,
      label: engine.label,
      available: await engine.isAvailable(),
      reason: engine.unavailableReason(),
    })),
  );
}

export type { PlannerEngine, EngineId } from "./types";

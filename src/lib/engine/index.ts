import { apiEngine } from "./api";
import { makeCliEngine } from "./cli";
import { makeWebEngine } from "./web";
import { listAgents } from "./agents";
import { listWebRecipes } from "@/lib/providers/web/recipes";
import type { PlannerEngine } from "./types";

/**
 * 기획 엔진 선택.
 *
 * 구독제로 쓰는 CLI들(agents.json)이 1순위다. 구독은 API 키를 주지 않으므로
 * 이쪽이 기본 경로다. 종량제 API 키가 있으면 그것도 쓸 수 있다.
 *
 * PLANNER_AGENT=<에이전트 id>  특정 CLI로 고정 (예: claude, codex)
 * PLANNER_AGENT=api            종량제 API 강제
 * 비워두면: 설치돼 있고 쓸 수 있는 CLI를 순서대로 찾고, 없으면 API로 넘어간다.
 */

/**
 * 쓸 수 있는 엔진 전부. 순서가 곧 우선순위다.
 *
 * CLI가 먼저다 — 브라우저 자동화보다 빠르고, 화면 변경에 안 깨지고, 구조화 출력을
 * 지원한다. 웹 자동화는 CLI가 없는 서비스를 위한 경로다.
 */
async function buildEngines(): Promise<Array<{ id: string; engine: PlannerEngine }>> {
  const [agents, recipes] = await Promise.all([listAgents(), listWebRecipes()]);
  return [
    ...agents.map((agent) => ({ id: agent.id, engine: makeCliEngine(agent) })),
    ...recipes.map((recipe) => ({ id: recipe.id, engine: makeWebEngine(recipe) })),
    { id: "api", engine: apiEngine },
  ];
}

export async function selectEngine(): Promise<PlannerEngine> {
  const engines = await buildEngines();
  const forced = process.env.PLANNER_AGENT?.trim();

  if (forced) {
    const found = engines.find((e) => e.id === forced);
    if (!found) {
      throw new Error(
        `PLANNER_AGENT에 지정한 "${forced}"를 찾지 못했습니다. 연결 상태 화면에서 id를 확인하세요.`,
      );
    }
    if (!(await found.engine.isAvailable())) {
      throw new Error(found.engine.unavailableReason());
    }
    return found.engine;
  }

  for (const { engine } of engines) {
    if (await engine.isAvailable()) return engine;
  }

  throw new Error(
    [
      "기획을 만들 방법이 없습니다. 아래 중 하나가 필요합니다:",
      "  · 구독 CLI — 설치하고 로그인 (가장 빠르고 안정적)",
      "  · 구독 웹 — 연결 상태 화면에서 '로그인'을 눌러 한 번 로그인",
      "  · 종량제 — .env.local에 ANTHROPIC_API_KEY 설정",
    ].join("\n"),
  );
}

/**
 * 설정 화면에 보여줄 엔진 상태.
 *
 * 웹 프로바이더의 준비 여부 확인은 브라우저를 띄워야 해서 느리다.
 * `probeWeb`을 켰을 때만 확인한다.
 */
export async function engineStatus(probeWeb = false) {
  const [agents, recipes] = await Promise.all([listAgents(), listWebRecipes()]);

  const cli = await Promise.all(
    agents.map(async (agent) => ({
      id: agent.id,
      label: agent.label,
      target: agent.command,
      kind: "cli" as const,
      ready: await makeCliEngine(agent).isAvailable(),
      verified: agent.verified,
      notes: agent.notes,
    })),
  );

  const web = await Promise.all(
    recipes.map(async (recipe) => ({
      id: recipe.id,
      label: recipe.label,
      target: recipe.url,
      kind: "web" as const,
      ready: probeWeb ? await makeWebEngine(recipe).isAvailable() : null,
      verified: recipe.verified,
      notes: recipe.notes,
    })),
  );

  return [
    ...cli,
    ...web,
    {
      id: "api",
      label: apiEngine.label,
      target: "ANTHROPIC_API_KEY",
      kind: "api" as const,
      ready: await apiEngine.isAvailable(),
      verified: false,
      notes: "종량제 API 키를 쓸 때만 필요하다. 구독제라면 안 써도 된다.",
    },
  ];
}

export type { PlannerEngine } from "./types";

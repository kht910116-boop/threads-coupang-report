import { apiEngine } from "./api";
import { googleEngine } from "./google";
import { makeCliEngine } from "./cli";
import { makeWebEngine } from "./web";
import { listAgents } from "./agents";
import { listWebRecipes } from "@/lib/providers/web/recipes";
import type { Engine } from "./types";

/**
 * 엔진 선택.
 *
 * 우선순위는 CLI → 웹 → 종량제 API다. CLI가 먼저인 이유는 빠르고,
 * 화면 변경에 안 깨지고, 구조화 출력을 지원하기 때문이다.
 *
 * PLANNER_AGENT=<id>로 못박을 수 있다.
 */

export async function allEngines(model = ""): Promise<Engine[]> {
  const [agents, recipes] = await Promise.all([listAgents(), listWebRecipes()]);
  return [
    ...agents.map((agent) => makeCliEngine(agent, model)),
    ...recipes.map(makeWebEngine),
    apiEngine,
    googleEngine,
  ];
}

/**
 * 프로젝트가 엔진을 지정했으면 그걸, 아니면 환경변수, 아니면 자동 선택.
 *
 * @param model 그 엔진 안에서 고른 모델. 엔진마다 목록이 다르므로, 지정한
 *   엔진에 없는 모델이면 그냥 무시된다(CLI 기본값을 쓴다).
 */
export async function selectEngine(preferredId?: string, model = ""): Promise<Engine> {
  const engines = await allEngines(model);
  const wanted = preferredId?.trim() || process.env.PLANNER_AGENT?.trim();

  if (wanted) {
    const found = engines.find((e) => e.id === wanted);
    if (!found) {
      throw new Error(
        `엔진 "${wanted}"를 찾지 못했습니다. 연결 상태 화면에서 id를 확인하세요.`,
      );
    }
    if (!(await found.isAvailable())) throw new Error(found.unavailableReason());
    return found;
  }

  for (const engine of engines) {
    if (await engine.isAvailable()) return engine;
  }

  throw new Error(
    [
      "쓸 수 있는 AI가 없습니다. 아래 중 하나가 필요합니다:",
      "  · 구독 CLI — 설치하고 로그인 (가장 빠르고 안정적)",
      "  · 구독 웹 — 연결 상태 화면에서 '로그인'을 눌러 한 번 로그인",
      "  · 종량제 — .env.local에 ANTHROPIC_API_KEY 설정",
    ].join("\n"),
  );
}

/**
 * 설정 화면에 보여줄 엔진 상태.
 * 웹은 확인에 브라우저를 띄워야 해서 `probeWeb`을 켰을 때만 확인한다.
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
      models: agent.models,
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
      models: [],
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
      models: [],
    },
    {
      id: googleEngine.id,
      label: googleEngine.label,
      target: "GOOGLE_GENAI_API_KEY",
      kind: "api" as const,
      ready: await googleEngine.isAvailable(),
      verified: false,
      models: [],
      notes:
        "구독만 쓴다는 원칙의 의도적 예외 — 무료 한도 안에서만 쓰기로 한 경로다. " +
        "대량 작업은 구독 CLI로 돌릴 것.",
    },
  ];
}

export type { Engine, CompleteArgs } from "./types";

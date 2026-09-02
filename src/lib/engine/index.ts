import { apiEngine } from "./api";
import { makeCliEngine } from "./cli";
import { listAgents } from "./agents";
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

export async function allEngines(): Promise<PlannerEngine[]> {
  const agents = await listAgents();
  return [...agents.map(makeCliEngine), apiEngine];
}

export async function selectEngine(): Promise<PlannerEngine> {
  const forced = process.env.PLANNER_AGENT?.trim();

  if (forced) {
    if (forced === "api") {
      if (!(await apiEngine.isAvailable())) throw new Error(apiEngine.unavailableReason());
      return apiEngine;
    }
    const agent = (await listAgents()).find((a) => a.id === forced);
    if (!agent) {
      throw new Error(
        `PLANNER_AGENT에 지정한 "${forced}"를 agents.json에서 찾지 못했습니다.`,
      );
    }
    const engine = makeCliEngine(agent);
    if (!(await engine.isAvailable())) throw new Error(engine.unavailableReason());
    return engine;
  }

  for (const agent of await listAgents()) {
    const engine = makeCliEngine(agent);
    if (await engine.isAvailable()) return engine;
  }
  if (await apiEngine.isAvailable()) return apiEngine;

  throw new Error(
    [
      "기획을 만들 방법이 없습니다. 둘 중 하나가 필요합니다:",
      "  · 구독제 — 구독 CLI 중 하나를 설치하고 로그인 (연결 상태 화면에서 확인)",
      "  · 종량제 — .env.local에 ANTHROPIC_API_KEY 설정",
    ].join("\n"),
  );
}

/** 설정 화면에 보여줄 엔진 상태. */
export async function engineStatus() {
  const agents = await listAgents();

  const cli = await Promise.all(
    agents.map(async (agent) => {
      const engine = makeCliEngine(agent);
      return {
        id: agent.id,
        label: agent.label,
        command: agent.command,
        kind: "cli" as const,
        installed: await engine.isAvailable(),
        verified: agent.verified,
        notes: agent.notes,
      };
    }),
  );

  return [
    ...cli,
    {
      id: "api",
      label: apiEngine.label,
      command: "ANTHROPIC_API_KEY",
      kind: "api" as const,
      installed: await apiEngine.isAvailable(),
      verified: false,
      notes: "종량제 API 키를 쓸 때만 필요하다. 구독제라면 안 써도 된다.",
    },
  ];
}

export type { PlannerEngine } from "./types";

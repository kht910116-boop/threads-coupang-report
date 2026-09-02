import { z } from "zod";
import { handle } from "@/lib/http";
import { agentSchema, listAgents, saveAgents } from "@/lib/engine/agents";

export const dynamic = "force-dynamic";

/**
 * CLI 에이전트 설정 읽기/쓰기.
 * 새 구독 CLI를 붙이는 건 여기 항목을 하나 추가하는 일이다 — 코드 수정 없이.
 */
export async function GET() {
  return handle(() => listAgents());
}

export async function PUT(request: Request) {
  return handle(async () =>
    saveAgents(z.array(agentSchema).parse(await request.json())),
  );
}

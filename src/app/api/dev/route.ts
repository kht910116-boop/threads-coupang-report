import { z } from "zod";
import { handle } from "@/lib/http";
import { inspectSource, saveDevConfig } from "@/lib/dev/source";
import { listAgents } from "@/lib/engine/agents";

export const dynamic = "force-dynamic";

/** 앱 고치기가 켜져 있는지, 어느 CLI가 코드를 고칠 수 있는지. */
export async function GET() {
  return handle(async () => {
    const [state, agents] = await Promise.all([inspectSource(), listAgents()]);
    return {
      ...state,
      // patchArgs가 있는 항목만 코드를 고칠 수 있다. 없으면 그 CLI는 대화만 한다.
      agents: agents
        .filter((a) => a.patchArgs.length > 0)
        .map((a) => ({ id: a.id, label: a.label, models: a.models })),
    };
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    const body = z.object({ sourceDir: z.string() }).parse(await request.json());
    await saveDevConfig(body);
    return inspectSource();
  });
}

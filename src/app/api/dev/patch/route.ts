import { z } from "zod";
import { handle } from "@/lib/http";
import { dirtyFiles, inspectSource, runIn } from "@/lib/dev/source";
import { getAgent } from "@/lib/engine/agents";

export const maxDuration = 3600;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  request: z.string().min(1),
  agentId: z.string().min(1),
  model: z.string().default(""),
});

/**
 * 비서에게 앱 소스를 고치게 한다.
 *
 * 커밋하지 않는다. 푸시하지 않는다. 고친 다음 **무엇이 달라졌는지 diff로** 준다.
 * 사용자가 그걸 보고 두고 갈지 되돌릴지 정한다.
 *
 * 실행 전에 이미 손대져 있던 파일 목록을 떠 둔다. 비서가 건드린 것만 따로 알아야
 * 되돌리기가 사용자 작업을 날리지 않는다.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const state = await inspectSource();
    if (!state.ok) throw new Error(state.reason);

    const { request: ask, agentId, model } = bodySchema.parse(await request.json());
    const agent = await getAgent(agentId);
    if (!agent) throw new Error(`에이전트 "${agentId}"를 찾을 수 없습니다.`);
    if (agent.patchArgs.length === 0) {
      throw new Error(`${agent.label}은(는) 코드를 고치는 설정이 없습니다.`);
    }

    const before = new Set(await dirtyFiles(state.sourceDir));

    const args = agent.patchArgs.map((a) => a.replace(/\{\{user\}\}/g, ask));
    if (model && agent.models.some((m) => m.id === model)) {
      args.push(...agent.modelArgs.map((a) => a.replace(/\{\{model\}\}/g, model)));
    }

    const result = await runIn(
      state.sourceDir,
      agent.command,
      args,
      // 코드를 고치는 일은 대화보다 훨씬 오래 걸린다. 파일을 여러 개 읽고 고친다.
      60 * 60 * 1000,
      agent.env,
    );

    const after = await dirtyFiles(state.sourceDir);
    const touched = after.filter((f) => !before.has(f));

    const diff = await runIn(
      state.sourceDir,
      "git",
      ["diff", "--stat", "HEAD"],
      60_000,
    );
    const full = await runIn(state.sourceDir, "git", ["diff", "HEAD"], 120_000);

    return {
      // CLI가 무슨 말을 했는지. 못 고쳤으면 여기 이유가 있다.
      output: (result.stdout || result.stderr).trim().slice(-4000),
      code: result.code,
      touched,
      // 사용자가 이미 손대고 있던 것. 되돌리기가 이건 안 건드린다고 알려주려고.
      preexisting: [...before],
      stat: diff.stdout.trim(),
      diff: full.stdout.slice(0, 100_000),
    };
  });
}

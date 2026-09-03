import { z } from "zod";
import { handle } from "@/lib/http";
import { selectEngine } from "@/lib/engine";
import { ASSISTANT_SYSTEM, assistantContext } from "@/lib/pipeline/generate";
import { getProject } from "@/lib/store";
import { STEPS, STEP_LABEL } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 600;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1),
  step: z.enum(STEPS),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .default([]),
  engineId: z.string().optional(),
  model: z.string().optional(),
});

/**
 * 단계마다 따라다니는 비서.
 * 지금 프로젝트 상태를 매번 시스템 프롬프트에 실어 보내서, 비서가
 * "3번째 줄이 너무 길어요" 같은 구체적인 말을 할 수 있게 한다.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { message, step, history, engineId, model } = bodySchema.parse(
      await request.json(),
    );
    const engine = await selectEngine(engineId, model);

    const answer = await engine.complete({
      system: `${ASSISTANT_SYSTEM}\n\n${assistantContext(project, STEP_LABEL[step])}`,
      user: message,
      history,
    });

    return { answer: answer.trim(), engine: engine.label };
  });
}

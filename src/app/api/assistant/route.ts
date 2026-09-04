import { z } from "zod";
import { handle } from "@/lib/http";
import { selectEngine } from "@/lib/engine";
import { APP_GUIDE } from "@/lib/pipeline/assistant";

export const maxDuration = 600;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .default([]),
  engineId: z.string().optional(),
  model: z.string().optional(),
});

/**
 * 프로젝트 없이 묻는 비서.
 *
 * 프로젝트 안의 비서는 대본과 장면을 들고 답하지만, 첫 화면에는 그럴 것이 없다.
 * 그렇다고 물어볼 데가 없으면 안 된다 — "이거 어떻게 쓰는 거냐", "쇼츠는 어느
 * 프리셋이냐" 같은 것은 프로젝트를 만들기 **전에** 묻는 말이다.
 *
 * 그래서 여기서는 앱 자체를 설명하는 것을 컨텍스트로 준다.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { message, history, engineId, model } = bodySchema.parse(await request.json());
    const engine = await selectEngine(engineId, model);

    const answer = await engine.complete({
      system: APP_GUIDE,
      user: message,
      history,
    });

    return { answer: answer.trim(), edits: [], rejected: [], engine: engine.label };
  });
}

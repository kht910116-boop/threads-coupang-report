import { z } from "zod";
import { handle } from "@/lib/http";
import { selectEngine } from "@/lib/engine";
import {
  ASSISTANT_SCHEMA,
  ASSISTANT_SYSTEM,
  assistantContext,
  validateEdits,
  type Edit,
} from "@/lib/pipeline/assistant";
import { refreshSceneDurations } from "@/lib/pipeline/generate";
import { getProject, saveProject } from "@/lib/store";
import { STEPS, STEP_LABEL, type Project } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 600;
export const dynamic = "force-dynamic";

const askSchema = z.object({
  message: z.string().min(1),
  step: z.enum(STEPS),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .default([]),
  engineId: z.string().optional(),
  model: z.string().optional(),
});

/**
 * 단계마다 따라다니는 비서.
 *
 * POST 물어본다. 답과 함께 **바꿀 것들의 제안**이 온다. 아직 아무것도 안 바뀐다.
 * PUT  사용자가 고른 제안을 실제로 적용한다.
 *
 * 둘로 가른 이유는 되돌리기가 없어서다. 455줄짜리 대본을 비서가 조용히 고쳐놓으면
 * 무엇이 달라졌는지 찾을 방법이 없다. 바꾸기 전과 후를 사용자가 보게 하는 것이
 * 이 기능의 절반이다.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { message, step, history, engineId, model } = askSchema.parse(
      await request.json(),
    );
    const engine = await selectEngine(engineId, model);

    const raw = await engine.complete({
      system: `${ASSISTANT_SYSTEM}\n\n${assistantContext(project, step, STEP_LABEL[step])}`,
      user: message,
      history,
      schema: ASSISTANT_SCHEMA as unknown as Record<string, unknown>,
    });

    /*
      스키마를 줘도 앞뒤에 말을 붙이는 모델이 있다. 통째로 실패시키기보다
      JSON을 찾아서 쓰고, 그것도 없으면 원문을 그냥 답으로 보여준다 —
      고치기가 안 되는 것과 대화가 안 되는 것은 다른 문제다.
    */
    type Parsed = { answer?: string; edits?: Edit[] };
    let parsed: Parsed | null = null;
    try {
      parsed = JSON.parse(raw) as Parsed;
    } catch {
      const match = /\{[\s\S]*\}/.exec(raw);
      if (match) {
        try {
          parsed = JSON.parse(match[0]) as Parsed;
        } catch {
          parsed = null;
        }
      }
    }

    if (!parsed || typeof parsed.answer !== "string") {
      return { answer: raw.trim(), edits: [], rejected: [], engine: engine.label };
    }

    const { ok, rejected } = validateEdits(project, parsed.edits ?? []);
    return { answer: parsed.answer.trim(), edits: ok, rejected, engine: engine.label };
  });
}

const applySchema = z.object({
  edits: z.array(
    z.object({
      target: z.enum(["line", "scene", "setting"]),
      id: z.string().optional(),
      field: z.string(),
      value: z.string(),
    }),
  ),
});

/** 점 표기 경로에 값을 넣은 사본을 만든다. 원본은 건드리지 않는다. */
function setPath(
  source: Record<string, unknown>,
  dotPath: string,
  value: number,
): Record<string, unknown> {
  const [head, ...rest] = dotPath.split(".");
  return {
    ...source,
    [head]:
      rest.length === 0
        ? value
        : setPath(source[head] as Record<string, unknown>, rest.join("."), value),
  };
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { edits } = applySchema.parse(await request.json());

    let next: Project = project;

    for (const edit of edits) {
      if (edit.target === "line") {
        next = {
          ...next,
          lines: next.lines.map((l) =>
            l.id === edit.id ? { ...l, [edit.field]: edit.value } : l,
          ),
        };
      } else if (edit.target === "scene") {
        next = {
          ...next,
          scenes: next.scenes.map((s) =>
            s.id === edit.id ? { ...s, [edit.field]: edit.value } : s,
          ),
        };
      } else {
        next = setPath(
          next as unknown as Record<string, unknown>,
          edit.field,
          Number(edit.value),
        ) as unknown as Project;
      }
    }

    // 자막 글자가 바뀌면 장면 길이 추정이 달라진다. 음성이 있는 줄은 실제 길이를 쓴다.
    if (edits.some((e) => e.target === "line" && e.field === "text")) {
      next = { ...next, scenes: refreshSceneDurations(next) };
    }

    return { project: await saveProject(next), applied: edits.length };
  });
}

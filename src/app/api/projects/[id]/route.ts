import { z } from "zod";
import { handle, notFound } from "@/lib/http";
import { deleteProject, getProject, saveProject } from "@/lib/store";
import { CUT_MODES } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** 컷 손질 — 사용자가 고친 필드만 덮어쓴다. */
const patchSchema = z.object({
  cuts: z
    .array(
      z.object({
        id: z.string(),
        narration: z.string().optional(),
        onScreenText: z.string().optional(),
        imagePrompt: z.string().optional(),
        imageDescription: z.string().optional(),
        motionPrompt: z.string().optional(),
        durationSec: z.number().positive().optional(),
        mode: z.enum(CUT_MODES).optional(),
        locked: z.boolean().optional(),
      }),
    )
    .optional(),
  brief: z.string().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return notFound("프로젝트");
  return handle(async () => project);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const patch = patchSchema.parse(await request.json());
    const edits = new Map((patch.cuts ?? []).map((c) => [c.id, c]));

    return saveProject({
      ...project,
      brief: patch.brief ?? project.brief,
      cuts: project.cuts.map((cut) => {
        const edit = edits.get(cut.id);
        if (!edit) return cut;
        const { id: _ignored, ...fields } = edit;
        // undefined 필드가 값을 덮어쓰지 않게 걸러낸다.
        const defined = Object.fromEntries(
          Object.entries(fields).filter(([, v]) => v !== undefined),
        );
        return { ...cut, ...defined };
      }),
    });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await deleteProject(id);
  if (!removed) return notFound("프로젝트");
  return handle(async () => ({ ok: true }));
}

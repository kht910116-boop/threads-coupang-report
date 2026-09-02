import { z } from "zod";
import { handle, notFound } from "@/lib/http";
import { deleteProject, getProject, saveProject } from "@/lib/store";
import { refreshSceneDurations } from "@/lib/pipeline/generate";
import {
  captionStyleSchema,
  effectSettingsSchema,
  imageStyleSchema,
  intervalsSchema,
  referenceSchema,
  SCENE_EFFECTS,
  CUT_MODES,
  MAX_REFERENCES,
  STEPS,
  ttsSettingsSchema,
} from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** 손질 — 준 필드만 덮어쓴다. */
const patchSchema = z.object({
  topic: z.string().optional(),
  brief: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  references: z.array(referenceSchema).max(MAX_REFERENCES).optional(),

  intervals: intervalsSchema.optional(),
  tts: ttsSettingsSchema.optional(),
  caption: captionStyleSchema.optional(),
  effects: effectSettingsSchema.optional(),
  image: imageStyleSchema.optional(),

  lines: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .optional(),
  scenes: z
    .array(
      z.object({
        id: z.string(),
        summaryKo: z.string().optional(),
        prompt: z.string().optional(),
        motionPrompt: z.string().optional(),
        mode: z.enum(CUT_MODES).optional(),
        effect: z.enum(SCENE_EFFECTS).optional(),
        replaceable: z.boolean().optional(),
        locked: z.boolean().optional(),
      }),
    )
    .optional(),
  done: z.array(z.enum(STEPS)).optional(),
});

/** undefined가 값을 덮어쓰지 않게 걸러낸다. */
function defined<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

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
    const lineEdits = new Map((patch.lines ?? []).map((l) => [l.id, l]));
    const sceneEdits = new Map((patch.scenes ?? []).map((s) => [s.id, s]));

    let next = {
      ...project,
      ...defined({
        topic: patch.topic,
        brief: patch.brief,
        title: patch.title,
        description: patch.description,
        references: patch.references,
        intervals: patch.intervals,
        tts: patch.tts,
        caption: patch.caption,
        effects: patch.effects,
        image: patch.image,
        done: patch.done,
      }),
      lines: project.lines.map((line) => {
        const edit = lineEdits.get(line.id);
        // 글이 바뀌면 기존 음성은 더 이상 맞지 않는다.
        if (!edit || edit.text === line.text) return line;
        return { ...line, text: edit.text, audio: null };
      }),
      scenes: project.scenes.map((scene) => {
        const edit = sceneEdits.get(scene.id);
        if (!edit) return scene;
        const { id: _ignored, ...fields } = edit;
        return { ...scene, ...defined(fields) };
      }),
    };

    // 자막을 고쳤으면 씬 길이도 다시 맞춘다.
    if (patch.lines) next = { ...next, scenes: refreshSceneDurations(next) };

    return saveProject(next);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await deleteProject(id);
  if (!removed) return notFound("프로젝트");
  return handle(async () => ({ ok: true }));
}

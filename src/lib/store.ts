import fs from "node:fs/promises";
import {
  dataDir,
  ensureDir,
  presetsFile,
  projectFile,
  projectsDir,
} from "@/lib/paths";
import { now, uuid } from "@/lib/id";
import { DEFAULT_PRESETS } from "@/lib/presets/defaults";
import {
  presetSchema,
  projectSchema,
  type Preset,
  type PresetInput,
  type Project,
  type Reference,
} from "@/lib/types";

/**
 * 파일 기반 저장소. 개인용 단일 사용자 도구라 DB를 두지 않는다.
 * 쓰기는 임시 파일에 쓰고 rename 해서, 도중에 죽어도 반쪽 JSON이 남지 않게 한다.
 */

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

// ── 프리셋 ────────────────────────────────────────────────────

/**
 * 저장된 프리셋을 읽되, 아직 없는 기본 프리셋은 합쳐 넣는다.
 * 사용자가 고친 기본 프리셋은 그대로 둔다 — id가 이미 있으면 건드리지 않는다.
 */
export async function listPresets(): Promise<Preset[]> {
  await ensureDir(dataDir());
  const stored = (await readJson<unknown[]>(presetsFile())) ?? [];
  const presets = stored
    .map((raw) => presetSchema.safeParse(raw))
    .filter((r) => r.success)
    .map((r) => r.data);

  const known = new Set(presets.map((p) => p.id));
  const missing = DEFAULT_PRESETS.filter((seed) => !known.has(seed.id)).map((seed) =>
    presetSchema.parse({
      ...seed,
      builtin: true,
      createdAt: now(),
      updatedAt: now(),
    }),
  );

  if (missing.length > 0) {
    const merged = [...presets, ...missing];
    await writeJson(presetsFile(), merged);
    return merged;
  }
  return presets;
}

export async function getPreset(id: string): Promise<Preset | null> {
  const presets = await listPresets();
  return presets.find((p) => p.id === id) ?? null;
}

export async function createPreset(input: PresetInput): Promise<Preset> {
  const presets = await listPresets();
  const preset = presetSchema.parse({
    ...input,
    id: uuid(),
    builtin: false,
    createdAt: now(),
    updatedAt: now(),
  });
  await writeJson(presetsFile(), [...presets, preset]);
  return preset;
}

export async function updatePreset(
  id: string,
  input: PresetInput,
): Promise<Preset | null> {
  const presets = await listPresets();
  const index = presets.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const updated = presetSchema.parse({
    ...input,
    id,
    // 기본 프리셋을 고쳐도 builtin 표시는 유지한다 (삭제 방지용 표식일 뿐이다).
    builtin: presets[index].builtin,
    createdAt: presets[index].createdAt,
    updatedAt: now(),
  });
  presets[index] = updated;
  await writeJson(presetsFile(), presets);
  return updated;
}

export async function deletePreset(id: string): Promise<boolean> {
  const presets = await listPresets();
  const target = presets.find((p) => p.id === id);
  if (!target || target.builtin) return false;
  await writeJson(
    presetsFile(),
    presets.filter((p) => p.id !== id),
  );
  return true;
}

// ── 프로젝트 ──────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  await ensureDir(projectsDir());
  const files = await fs.readdir(projectsDir());
  const projects: Project[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await readJson<unknown>(`${projectsDir()}/${file}`);
    const parsed = projectSchema.safeParse(raw);
    if (parsed.success) projects.push(parsed.data);
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | null> {
  await ensureDir(projectsDir());
  const raw = await readJson<unknown>(projectFile(id));
  if (raw === null) return null;
  const parsed = projectSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveProject(project: Project): Promise<Project> {
  await ensureDir(projectsDir());
  const next = { ...project, updatedAt: now() };
  await writeJson(projectFile(project.id), next);
  return next;
}

export async function createProject(args: {
  topic: string;
  brief: string;
  references: Reference[];
  preset: Preset;
}): Promise<Project> {
  const project = projectSchema.parse({
    id: uuid(),
    topic: args.topic,
    brief: args.brief,
    references: args.references,
    presetId: args.preset.id,
    preset: args.preset,
    // 프리셋 값을 프로젝트로 복사해 온다. 여기서 고쳐도 프리셋은 안 바뀐다.
    intervals: args.preset.intervals,
    tts: args.preset.tts,
    caption: args.preset.caption,
    effects: args.preset.effects,
    image: args.preset.image,
    title: "",
    summary: "",
    description: "",
    hashtags: [],
    thumbnailPrompt: "",
    sections: [],
    lines: [],
    scenes: [],
    done: [],
    createdAt: now(),
    updatedAt: now(),
  });
  return saveProject(project);
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    await fs.unlink(projectFile(id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

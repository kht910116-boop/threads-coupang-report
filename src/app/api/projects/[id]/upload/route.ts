import fs from "node:fs/promises";
import path from "node:path";
import { handle } from "@/lib/http";
import { assetsDir, ensureDir, toRelative } from "@/lib/paths";
import { now } from "@/lib/id";
import { getProject, saveProject } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const EXTENSION_BY_KIND: Record<string, string> = {
  image: ".png",
  video: ".mp4",
  audio: ".mp3",
};

/** 이미지/영상/음성을 직접 올린다 — '직접 넣기' 모드의 입구. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const form = await request.formData();
    const cutId = String(form.get("cutId") ?? "");
    const kind = String(form.get("kind") ?? "");
    const file = form.get("file");

    if (!["image", "video", "audio"].includes(kind)) {
      throw new Error(`kind는 image/video/audio 중 하나여야 합니다: ${kind}`);
    }
    if (!(file instanceof File)) throw new Error("파일이 없습니다.");

    const cut = project.cuts.find((c) => c.id === cutId);
    if (!cut) throw new Error("컷을 찾을 수 없습니다.");

    const dir = assetsDir(id);
    await ensureDir(dir);
    const extension = path.extname(file.name) || EXTENSION_BY_KIND[kind];
    const target = path.join(
      dir,
      `${String(cut.index + 1).padStart(3, "0")}-${kind}-${Date.now()}${extension}`,
    );
    await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));

    const ref = { path: toRelative(target), provider: "upload", createdAt: now() };
    return saveProject({
      ...project,
      cuts: project.cuts.map((c) => (c.id === cutId ? { ...c, [kind]: ref } : c)),
    });
  });
}

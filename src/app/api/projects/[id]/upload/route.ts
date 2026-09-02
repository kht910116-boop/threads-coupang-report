import fs from "node:fs/promises";
import path from "node:path";
import { handle } from "@/lib/http";
import { assetsDir, ensureDir, toRelative } from "@/lib/paths";
import { now } from "@/lib/id";
import { getProject, saveProject } from "@/lib/store";
import { audioDurationSec } from "@/lib/pipeline/audio";
import { refreshSceneDurations } from "@/lib/pipeline/generate";
import { estimateDurationSec } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * 파일을 직접 올린다 — '직접 넣기' 모드의 입구.
 * 이미지·영상은 장면(sceneId)에, 음성은 자막 줄(lineId)에 붙는다.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const form = await request.formData();
    const kind = String(form.get("kind") ?? "");
    const targetId = String(form.get("targetId") ?? "");
    const file = form.get("file");

    if (!["image", "video", "audio"].includes(kind)) {
      throw new Error(`kind는 image/video/audio 중 하나여야 합니다: ${kind}`);
    }
    if (!(file instanceof File)) throw new Error("파일이 없습니다.");

    const dir = assetsDir(id);
    await ensureDir(dir);
    const extension = path.extname(file.name) || (kind === "audio" ? ".mp3" : ".png");
    const data = Buffer.from(await file.arrayBuffer());

    if (kind === "audio") {
      const line = project.lines.find((l) => l.id === targetId);
      if (!line) throw new Error("자막 줄을 찾을 수 없습니다.");

      const target = path.join(
        dir,
        `line-${String(line.index + 1).padStart(3, "0")}-${Date.now()}${extension}`,
      );
      await fs.writeFile(target, data);

      let next = {
        ...project,
        lines: project.lines.map((l) =>
          l.id === targetId
            ? {
                ...l,
                audio: {
                  path: toRelative(target),
                  provider: "upload",
                  durationSec: audioDurationSec(data) ?? estimateDurationSec(l.text),
                  createdAt: now(),
                },
              }
            : l,
        ),
      };
      next = { ...next, scenes: refreshSceneDurations(next) };
      return saveProject(next);
    }

    const scene = project.scenes.find((s) => s.id === targetId);
    if (!scene) throw new Error("장면을 찾을 수 없습니다.");

    const target = path.join(
      dir,
      `scene-${String(scene.index + 1).padStart(3, "0")}-${kind}-${Date.now()}${extension}`,
    );
    await fs.writeFile(target, data);

    return saveProject({
      ...project,
      scenes: project.scenes.map((s) =>
        s.id === targetId
          ? {
              ...s,
              [kind]: { path: toRelative(target), provider: "upload", createdAt: now() },
            }
          : s,
      ),
    });
  });
}

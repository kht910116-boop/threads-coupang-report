import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { handle } from "@/lib/http";
import { assetsDir, ensureDir, toRelative } from "@/lib/paths";
import { now } from "@/lib/id";
import { getProject, saveProject } from "@/lib/store";
import { getImageProvider } from "@/lib/providers/image";
import { getVideoProvider } from "@/lib/providers/video";
import { composeImagePrompt } from "@/lib/engine/prompt";
import type { AssetRef, Scene } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 900;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["image", "video"]),
  /** 비우면 아직 없는 장면을 전부 생성한다. */
  sceneIds: z.array(z.string()).optional(),
  redo: z.boolean().default(false),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { kind, sceneIds, redo } = bodySchema.parse(await request.json());

    const targets: Scene[] =
      sceneIds && sceneIds.length > 0
        ? project.scenes.filter((s) => sceneIds.includes(s.id))
        : project.scenes.filter((scene) => {
            if (kind === "image") return redo || !scene.image;
            // 영상은 'video 모드로 표시한 장면'만 만든다 — 비싸고 느리다.
            return scene.mode === "video" && (redo || !scene.video);
          });

    if (targets.length === 0) {
      return { generated: 0, failed: [], message: "생성할 장면이 없습니다." };
    }

    const dir = assetsDir(id);
    await ensureDir(dir);
    const made = new Map<string, AssetRef>();
    const failed: Array<{ scene: number; error: string }> = [];

    for (const scene of targets) {
      try {
        const num = String(scene.index + 1).padStart(3, "0");
        let data: Buffer;
        let extension: string;
        let providerId: string;

        if (kind === "image") {
          const provider = getImageProvider(project.image.provider);
          const result = await provider.generate({
            // 화풍 접두·접미를 여기서 붙인다. 그래야 모든 장면 그림체가 같다.
            prompt: composeImagePrompt(scene.prompt, project.image),
            aspect: project.preset.aspect,
            model: project.image.model,
          });
          data = result.image;
          extension = result.extension;
          providerId = provider.id;
        } else {
          const provider = getVideoProvider(project.preset.video.provider);
          const result = await provider.generate({
            prompt: [composeImagePrompt(scene.prompt, project.image), scene.motionPrompt]
              .filter(Boolean)
              .join(" "),
            aspect: project.preset.aspect,
            durationSec: scene.durationSec,
            model: project.preset.video.model,
          });
          data = result.video;
          extension = result.extension;
          providerId = provider.id;
        }

        const file = path.join(
          dir,
          `scene-${num}-${kind}-${Date.now()}.${extension}`,
        );
        await fs.writeFile(file, data);
        made.set(scene.id, {
          path: toRelative(file),
          provider: providerId,
          createdAt: now(),
        });
      } catch (error) {
        failed.push({
          scene: scene.index + 1,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const next = {
      ...project,
      scenes: project.scenes.map((scene) =>
        made.has(scene.id) ? { ...scene, [kind]: made.get(scene.id)! } : scene,
      ),
    };

    const step = kind === "image" ? ("images" as const) : ("videos" as const);
    const complete =
      kind === "image"
        ? next.scenes.every((s) => s.image)
        : next.scenes.filter((s) => s.mode === "video").every((s) => s.video);
    if (complete) next.done = [...new Set([...next.done, step])];

    return { generated: made.size, failed, project: await saveProject(next) };
  });
}

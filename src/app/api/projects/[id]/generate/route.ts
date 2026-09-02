import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { handle } from "@/lib/http";
import { assetsDir, ensureDir, toRelative } from "@/lib/paths";
import { now } from "@/lib/id";
import { getProject, saveProject } from "@/lib/store";
import { getImageProvider } from "@/lib/providers/image";
import { getVideoProvider } from "@/lib/providers/video";
import { getTtsProvider } from "@/lib/providers/tts";
import type { AssetRef, Cut, Project } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 800;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["image", "video", "audio"]),
  /** 비우면 해당 종류가 아직 없는 컷을 전부 생성한다. */
  cutIds: z.array(z.string()).optional(),
});

async function writeAsset(
  projectId: string,
  cut: Cut,
  kind: string,
  data: Buffer,
  extension: string,
  provider: string,
): Promise<AssetRef> {
  const dir = assetsDir(projectId);
  await ensureDir(dir);
  const file = path.join(
    dir,
    `${String(cut.index + 1).padStart(3, "0")}-${kind}-${Date.now()}.${extension}`,
  );
  await fs.writeFile(file, data);
  return { path: toRelative(file), provider, createdAt: now() };
}

/** 이미 그 종류의 에셋이 있는 컷은 건너뛴다 — 재실행이 안전하도록. */
function targetCuts(project: Project, kind: string, cutIds?: string[]): Cut[] {
  if (cutIds && cutIds.length > 0) {
    const wanted = new Set(cutIds);
    return project.cuts.filter((cut) => wanted.has(cut.id));
  }
  return project.cuts.filter((cut) => {
    if (kind === "image") return cut.mode === "image" && !cut.image;
    if (kind === "video") return cut.mode === "video" && !cut.video;
    return !cut.audio;
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { kind, cutIds } = bodySchema.parse(await request.json());
    const { preset } = project;
    const cuts = targetCuts(project, kind, cutIds);

    if (cuts.length === 0) {
      return { generated: 0, failed: [], message: "생성할 컷이 없습니다." };
    }

    const results = new Map<string, AssetRef>();
    const failed: Array<{ cut: number; error: string }> = [];

    // 순차 처리다. 이미지·영상 API는 동시 요청에 레이트리밋이 잘 걸린다.
    for (const cut of cuts) {
      try {
        if (kind === "image") {
          const provider = getImageProvider(preset.image.provider);
          const prompt = [cut.imagePrompt, preset.image.stylePrompt]
            .filter(Boolean)
            .join(", ");
          const result = await provider.generate({
            prompt,
            aspect: preset.aspect,
            model: preset.image.model,
          });
          results.set(
            cut.id,
            await writeAsset(id, cut, "img", result.image, result.extension, provider.id),
          );
        } else if (kind === "video") {
          const provider = getVideoProvider(preset.video.provider);
          const prompt = [cut.imagePrompt, cut.motionPrompt, preset.image.stylePrompt]
            .filter(Boolean)
            .join(", ");
          const result = await provider.generate({
            prompt,
            aspect: preset.aspect,
            durationSec: cut.durationSec,
            model: preset.video.model,
          });
          results.set(
            cut.id,
            await writeAsset(id, cut, "vid", result.video, result.extension, provider.id),
          );
        } else {
          const provider = getTtsProvider(preset.tts.provider);
          const result = await provider.synthesize({
            text: cut.narration,
            voiceId: preset.tts.voiceId,
            speed: preset.tts.speed,
            pitch: preset.tts.pitch,
            language: preset.script.language,
          });
          results.set(
            cut.id,
            await writeAsset(id, cut, "aud", result.audio, result.extension, provider.id),
          );
        }
      } catch (error) {
        failed.push({
          cut: cut.index + 1,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const field = kind === "image" ? "image" : kind === "video" ? "video" : "audio";
    const saved = await saveProject({
      ...project,
      cuts: project.cuts.map((cut) =>
        results.has(cut.id) ? { ...cut, [field]: results.get(cut.id)! } : cut,
      ),
      status: results.size > 0 ? "generating" : project.status,
    });

    return { generated: results.size, failed, project: saved };
  });
}

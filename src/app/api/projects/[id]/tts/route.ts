import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { handle } from "@/lib/http";
import { assetsDir, ensureDir, toRelative } from "@/lib/paths";
import { now } from "@/lib/id";
import { getProject, saveProject } from "@/lib/store";
import { getTtsProvider } from "@/lib/providers/tts";
import { audioDurationSec } from "@/lib/pipeline/audio";
import { refreshSceneDurations } from "@/lib/pipeline/generate";
import { estimateDurationSec, type ScriptLine } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 900;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** 비우면 아직 음성이 없는 줄을 전부 생성한다. */
  lineIds: z.array(z.string()).optional(),
  /** 이미 있는 음성도 다시 만들지 */
  redo: z.boolean().default(false),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { lineIds, redo } = bodySchema.parse(await request.json().catch(() => ({})));
    const provider = getTtsProvider(project.tts.provider);

    const targets: ScriptLine[] =
      lineIds && lineIds.length > 0
        ? project.lines.filter((l) => lineIds.includes(l.id))
        : project.lines.filter((l) => redo || !l.audio);

    if (targets.length === 0) {
      return { generated: 0, failed: [], message: "생성할 줄이 없습니다." };
    }

    const dir = assetsDir(id);
    await ensureDir(dir);

    const made = new Map<string, ScriptLine["audio"]>();
    const failed: Array<{ line: number; error: string }> = [];

    // 순차 처리다. TTS API는 동시 요청에 레이트리밋이 잘 걸린다.
    for (const line of targets) {
      try {
        const result = await provider.synthesize({
          text: line.text,
          voiceId: project.tts.voiceId,
          model: project.tts.model,
          speed: project.tts.speed,
          pitch: project.tts.pitch,
          language: project.preset.script.language,
        });

        const file = path.join(
          dir,
          `line-${String(line.index + 1).padStart(3, "0")}-${Date.now()}.${result.extension}`,
        );
        await fs.writeFile(file, result.audio);

        // 길이를 못 읽으면 글자수 추정치로 넘어간다 — 씬 묶기가 멈추면 안 된다.
        const duration = audioDurationSec(result.audio) ?? estimateDurationSec(line.text);
        made.set(line.id, {
          path: toRelative(file),
          provider: provider.id,
          durationSec: duration,
          createdAt: now(),
        });
      } catch (error) {
        failed.push({
          line: line.index + 1,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let next = {
      ...project,
      lines: project.lines.map((line) =>
        made.has(line.id) ? { ...line, audio: made.get(line.id)! } : line,
      ),
    };
    // 음성이 붙었으니 씬 길이를 실제 값으로 다시 맞춘다.
    next = { ...next, scenes: refreshSceneDurations(next) };

    const allDone = next.lines.every((l) => l.audio);
    if (allDone) next.done = [...new Set([...next.done, "tts" as const])];

    return { generated: made.size, failed, project: await saveProject(next) };
  });
}

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { handle } from "@/lib/http";
import { inspectSource, runIn, untrackedFiles } from "@/lib/dev/source";

export const dynamic = "force-dynamic";

/**
 * 비서가 고친 것을 되돌린다.
 *
 * **주는 파일만 되돌린다.** `git checkout -- .`처럼 통째로 되돌리면 사용자가 쓰던
 * 작업까지 날아간다. 그래서 patch 응답의 touched를 그대로 받아서 그것만 손댄다.
 *
 * 추적되지 않는 파일(비서가 새로 만든 것)은 체크아웃으로 못 지우므로 직접 지운다.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const state = await inspectSource();
    if (!state.ok) throw new Error(state.reason);

    const { files } = z
      .object({ files: z.array(z.string()).min(1) })
      .parse(await request.json());

    const untracked = await untrackedFiles(state.sourceDir);
    const restored: string[] = [];
    const deleted: string[] = [];

    for (const file of files) {
      // 저장소 밖으로 나가는 경로는 거부한다.
      const absolute = path.resolve(state.sourceDir, file);
      if (!absolute.startsWith(path.resolve(state.sourceDir))) continue;

      if (untracked.has(file)) {
        await fs.rm(absolute, { force: true });
        deleted.push(file);
      } else {
        await runIn(state.sourceDir, "git", ["checkout", "HEAD", "--", file], 60_000);
        restored.push(file);
      }
    }

    return { restored, deleted };
  });
}

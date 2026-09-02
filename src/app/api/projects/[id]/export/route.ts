import fs from "node:fs/promises";
import path from "node:path";
import { handle } from "@/lib/http";
import { exportProject } from "@/lib/export/bundle";
import { getProject, saveProject } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
    if (project.scenes.length === 0) {
      throw new Error("먼저 스토리보드를 만드세요. 장면이 없습니다.");
    }

    const result = await exportProject(project);
    await saveProject({
      ...project,
      done: [...new Set([...project.done, "styling" as const, "export" as const])],
    });

    // 캡컷 드래프트 폴더가 설정돼 있으면 거기까지 바로 넣어준다.
    const capcutDir = process.env.CAPCUT_DRAFT_DIR;
    let installedTo: string | null = null;
    if (capcutDir) {
      const target = path.join(capcutDir, path.basename(result.dir));
      try {
        await fs.cp(path.join(result.dir, "capcut"), target, { recursive: true });
        installedTo = target;
      } catch (error) {
        result.warnings.push(
          `캡컷 폴더에 복사하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { ...result, installedTo };
  });
}

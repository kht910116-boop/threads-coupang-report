import { z } from "zod";
import { handle } from "@/lib/http";
import { selectEngine } from "@/lib/engine";
import { generateStoryboard } from "@/lib/pipeline/generate";
import { groupLinesIntoScenes, checkGroups } from "@/lib/pipeline/grouping";
import { getProject, saveProject } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 900;
export const dynamic = "force-dynamic";

const bodySchema = z.object({ engineId: z.string().optional() });

/** GET — 만들기 전에 몇 개로 나뉠지 미리 본다. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const groups = groupLinesIntoScenes({
      sections: project.sections,
      lines: project.lines,
      intervals: project.intervals,
    });
    return {
      count: groups.length,
      groups: groups.map((g, index) => ({
        index,
        sectionId: g.sectionId,
        lineFrom: g.lineFrom,
        lineTo: g.lineTo,
        durationSec: g.durationSec,
      })),
      problems: checkGroups(groups, project.sections, project.intervals),
    };
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
    if (project.lines.length === 0) {
      throw new Error("대본이 없습니다. 1단계부터 하세요.");
    }

    const { engineId } = bodySchema.parse(await request.json().catch(() => ({})));
    const engine = await selectEngine(engineId);
    const scenes = await generateStoryboard(engine, project);

    return saveProject({
      ...project,
      scenes,
      done: [...new Set([...project.done, "storyboard" as const])],
    });
  });
}

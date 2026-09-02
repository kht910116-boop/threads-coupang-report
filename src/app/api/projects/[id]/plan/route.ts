import { handle } from "@/lib/http";
import { generatePlan } from "@/lib/claude";
import { getProject, saveProject } from "@/lib/store";
import { uuid } from "@/lib/id";
import type { Cut } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

// 적응형 사고가 붙은 기획 생성은 몇 분까지 간다.
export const maxDuration = 600;
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const plan = await generatePlan({
      preset: project.preset,
      topic: project.topic,
      brief: project.brief,
    });

    // 사용자가 잠근 컷은 새 기획에서도 살린다.
    const lockedByIndex = new Map(
      project.cuts.filter((c) => c.locked).map((c) => [c.index, c]),
    );

    const cuts: Cut[] = plan.cuts.map((cutPlan, index) => {
      const locked = lockedByIndex.get(index);
      if (locked) return locked;
      return {
        ...cutPlan,
        id: uuid(),
        index,
        mode: project.preset.video.defaultMode,
        image: null,
        video: null,
        audio: null,
        locked: false,
      };
    });

    return saveProject({ ...project, plan, cuts, status: "planned" });
  });
}

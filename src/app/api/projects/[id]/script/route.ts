import { z } from "zod";
import { handle } from "@/lib/http";
import { selectEngine } from "@/lib/engine";
import { generateScript, splitScript } from "@/lib/pipeline/generate";
import { getProject, saveProject } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

// 대본 생성은 몇 분까지 간다.
export const maxDuration = 900;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** 특정 엔진으로 돌리고 싶을 때. 비우면 자동 선택. */
  engineId: z.string().optional(),
  /**
   * write — 주제와 레퍼런스로 대본을 새로 쓴다 (기본).
   * paste — 이미 써 둔 대본을 받아 구간과 자막 줄로 나누기만 한다.
   */
  mode: z.enum(["write", "paste"]).default("write"),
  /** mode가 paste일 때 나눌 대본. */
  text: z.string().default(""),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const { engineId, mode, text } = bodySchema.parse(await request.json().catch(() => ({})));
    const engine = await selectEngine(engineId);

    if (mode === "paste" && !text.trim()) {
      throw new Error("나눌 대본이 비어 있습니다.");
    }

    const result =
      mode === "paste"
        ? await splitScript(engine, project, text.trim())
        : await generateScript(engine, project);

    return saveProject({
      ...project,
      title: result.title,
      summary: result.summary,
      description: result.description,
      hashtags: result.hashtags,
      thumbnailPrompt: result.thumbnailPrompt,
      sections: result.sections,
      lines: result.lines,
      // 대본이 바뀌면 기존 장면은 무효다. 처음부터 다시 짠다.
      scenes: [],
      done: ["script", "structure"],
    });
  });
}

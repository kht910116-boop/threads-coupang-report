import { z } from "zod";
import { handle } from "@/lib/http";
import { createProject, getPreset, listProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  topic: z.string().min(1, "주제를 입력하세요."),
  brief: z.string().default(""),
  presetId: z.string().min(1, "스타일을 고르세요."),
});

export async function GET() {
  return handle(async () =>
    // 목록에는 프리셋 사본·컷 전체가 필요 없다. 무거워지지 않게 줄여 보낸다.
    (await listProjects()).map((p) => ({
      id: p.id,
      topic: p.topic,
      title: p.plan?.title ?? null,
      presetName: p.preset.name,
      aspect: p.preset.aspect,
      cutCount: p.cuts.length,
      status: p.status,
      updatedAt: p.updatedAt,
    })),
  );
}

export async function POST(request: Request) {
  return handle(async () => {
    const input = createSchema.parse(await request.json());
    const preset = await getPreset(input.presetId);
    if (!preset) throw new Error("스타일(프리셋)을 찾을 수 없습니다.");
    return createProject({ topic: input.topic, brief: input.brief, preset });
  });
}

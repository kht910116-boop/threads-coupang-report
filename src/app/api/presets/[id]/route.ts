import { handle, notFound } from "@/lib/http";
import { deletePreset, updatePreset } from "@/lib/store";
import { presetInputSchema } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  return handle(async () => {
    const updated = await updatePreset(
      id,
      presetInputSchema.parse(await request.json()),
    );
    if (!updated) throw new Error("프리셋을 찾을 수 없습니다.");
    return updated;
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await deletePreset(id);
  if (!removed) {
    return notFound("삭제할 프리셋(기본 프리셋은 삭제할 수 없습니다)");
  }
  return handle(async () => ({ ok: true }));
}

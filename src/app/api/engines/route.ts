import { handle } from "@/lib/http";
import { engineStatus } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * 쓸 수 있는 AI 목록과 각자의 모델.
 *
 * 비서 화면의 드롭다운이 이걸 쓴다. 웹 레시피는 준비 여부를 확인하려면 브라우저를
 * 띄워야 해서 확인하지 않는다(ready가 null) — 목록에는 나오되 '준비 안 됨'으로
 * 막지는 않는다.
 */
export async function GET() {
  return handle(async () => {
    const rows = await engineStatus(false);
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      ready: row.ready,
      models: row.models,
    }));
  });
}

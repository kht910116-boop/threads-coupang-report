import { handle } from "@/lib/http";
import { ttsChoices } from "@/lib/providers/tts";
import { imageChoices } from "@/lib/providers/image";
import { videoChoices } from "@/lib/providers/video";

export const dynamic = "force-dynamic";

/**
 * 단계 화면의 드롭다운에 넣을 목록.
 * 코드에 박힌 어댑터 + 구독 웹 레시피가 한 목록으로 나온다.
 */
export async function GET() {
  return handle(async () => ({
    tts: await ttsChoices(),
    image: await imageChoices(),
    video: await videoChoices(),
  }));
}

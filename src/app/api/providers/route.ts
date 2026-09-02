import { handle } from "@/lib/http";
import { engineStatus } from "@/lib/engine";
import { getTtsProvider, ttsStatus } from "@/lib/providers/tts";
import { imageStatus } from "@/lib/providers/image";
import { videoStatus } from "@/lib/providers/video";
import { TTS_PROVIDERS, type TtsProviderId } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/providers               → 어떤 서비스에 키가 꽂혀 있는지
 * GET /api/providers?voices=<id>   → 그 TTS 서비스의 목소리 목록
 */
export async function GET(request: Request) {
  const voicesFor = new URL(request.url).searchParams.get("voices");

  return handle(async () => {
    if (voicesFor) {
      if (!(TTS_PROVIDERS as readonly string[]).includes(voicesFor)) {
        throw new Error(`알 수 없는 TTS 제공자: ${voicesFor}`);
      }
      const provider = getTtsProvider(voicesFor as TtsProviderId);
      if (!provider.listVoices) {
        return {
          voices: [],
          message: `${provider.label}은(는) 목소리 목록을 제공하지 않습니다. 서비스 화면에서 voice id를 복사해 넣어주세요.`,
        };
      }
      if (!provider.isConfigured()) {
        throw new Error(
          `${provider.label} API 키가 없습니다. (${provider.envKeys.join(", ")})`,
        );
      }
      return { voices: await provider.listVoices() };
    }

    return {
      engines: await engineStatus(),
      engineForced: process.env.PLANNER_ENGINE ?? null,
      tts: ttsStatus(),
      image: imageStatus(),
      video: videoStatus(),
      capcutDraftDir: process.env.CAPCUT_DRAFT_DIR ?? null,
    };
  });
}

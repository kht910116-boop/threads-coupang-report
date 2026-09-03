import { handle } from "@/lib/http";
import { getTtsProvider } from "@/lib/providers/tts";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * 고른 서비스가 무엇을 가지고 있는지.
 *
 * 모델과 목소리를 글자로 받던 자리를 없애기 위한 것이다. 사용자가 문서를 찾아
 * "eleven_multilingual_v2"를 옮겨 적게 하면 안 된다 — 오타를 내면 음성을 만들
 * 때가 되어서야 알게 된다.
 *
 * 목소리는 서비스에 물어봐야 알 수 있고, 그 호출은 실패할 수 있다(키가 없거나,
 * 무료 한도를 넘겼거나). **실패해도 200으로 돌려준다** — 목소리를 못 받아온 것이
 * 이 화면 전체를 못 쓰게 만들 이유는 없다. 모델은 그대로 고를 수 있어야 한다.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const provider = await getTtsProvider(decodeURIComponent(id));

    let voices: Array<{ id: string; name: string; detail: string }> = [];
    let voiceError: string | null = null;
    if (provider.listVoices) {
      try {
        voices = await provider.listVoices();
      } catch (err) {
        voiceError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      id: provider.id,
      label: provider.label,
      configured: provider.isConfigured(),
      models: provider.models ?? [],
      canListVoices: typeof provider.listVoices === "function",
      voices,
      voiceError,
    };
  });
}

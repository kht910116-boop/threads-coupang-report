import type { TtsProviderId } from "@/lib/types";
import type { TtsProvider } from "./types";
import { elevenlabs } from "./elevenlabs";
import { typecast } from "./typecast";
import { googleAiStudio } from "./google-ai-studio";
import { googleCloud } from "./google-cloud";

/**
 * TTS 어댑터 등록소.
 *
 * 새 서비스를 붙이려면: TtsProvider를 구현한 파일을 만들고,
 * types.ts의 TTS_PROVIDERS에 id를 추가한 뒤, 아래 배열에 넣으면 끝이다.
 */

/** 음성을 직접 넣을 때 쓰는 자리표시자. */
const manual: TtsProvider = {
  id: "manual",
  label: "직접 넣기 (합성 안 함)",
  envKeys: [],
  isConfigured: () => true,
  async synthesize() {
    throw new Error(
      "이 프리셋의 TTS가 '직접 넣기'로 되어 있습니다. 프리셋에서 서비스를 고르거나, 컷별로 음성 파일을 올려주세요.",
    );
  },
};

export const TTS_ADAPTERS: TtsProvider[] = [
  elevenlabs,
  typecast,
  googleAiStudio,
  googleCloud,
  manual,
];

export function getTtsProvider(id: TtsProviderId): TtsProvider {
  const provider = TTS_ADAPTERS.find((p) => p.id === id);
  if (!provider) throw new Error(`알 수 없는 TTS 제공자: ${id}`);
  return provider;
}

/** 설정 화면에서 어떤 서비스가 준비됐는지 보여주기 위한 요약. */
export function ttsStatus() {
  return TTS_ADAPTERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    envKeys: provider.envKeys,
    configured: provider.isConfigured(),
    canListVoices: typeof provider.listVoices === "function",
  }));
}

export type { TtsProvider, SynthesizeArgs, SynthesisResult, Voice } from "./types";

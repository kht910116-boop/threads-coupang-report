import { isWebProvider, webRecipeIdOf, type TtsProviderId } from "@/lib/types";
import { fetchMedia } from "@/lib/providers/web/driver";
import { getMediaRecipe, listMediaRecipes } from "@/lib/providers/web/media";
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

/**
 * 구독 웹을 TTS로 쓴다 — API 키가 필요 없다.
 * 읽을 문장을 입력창에 넣고, 나온 오디오 파일을 받아온다.
 */
async function makeWebTts(recipeId: string): Promise<TtsProvider> {
  const recipe = await getMediaRecipe(recipeId);
  if (!recipe) throw new Error(`웹 레시피 "${recipeId}"를 찾을 수 없습니다.`);
  if (recipe.kind !== "audio") {
    throw new Error(`"${recipe.label}"은(는) 음성용 레시피가 아닙니다.`);
  }

  return {
    id: `web:${recipe.id}`,
    label: `${recipe.label} (웹)`,
    envKeys: [],
    isConfigured: () => true,
    async synthesize({ text }) {
      const media = await fetchMedia(recipe, text);
      return {
        audio: media.data,
        extension: media.extension === "wav" ? "wav" : "mp3",
        mime: media.mime,
      };
    },
  };
}

export async function getTtsProvider(id: TtsProviderId): Promise<TtsProvider> {
  if (isWebProvider(id)) return makeWebTts(webRecipeIdOf(id));
  const provider = TTS_ADAPTERS.find((p) => p.id === id);
  if (!provider) throw new Error(`알 수 없는 TTS 제공자: ${id}`);
  return provider;
}

/** 화면에 보여줄 목록 — 코드에 박힌 것 + 구독 웹 레시피. */
export async function ttsChoices() {
  const recipes = await listMediaRecipes();
  return [
    ...TTS_ADAPTERS.map((p) => ({
      id: p.id,
      label: p.label,
      kind: "builtin" as const,
      needsApiKey: p.envKeys.length > 0,
      configured: p.isConfigured(),
    })),
    ...recipes
      .filter((r) => r.kind === "audio")
      .map((r) => ({
        id: `web:${r.id}`,
        label: `${r.label} (웹)`,
        kind: "web" as const,
        needsApiKey: false,
        configured: true,
      })),
  ];
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

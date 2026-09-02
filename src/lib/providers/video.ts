import { isWebProvider, webRecipeIdOf, type Aspect, type VideoProviderId } from "@/lib/types";
import { fetchMedia } from "./web/driver";
import { getMediaRecipe, listMediaRecipes } from "./web/media";
import { httpError } from "./tts/types";

/**
 * 컷을 AI 영상으로 뽑는 어댑터.
 *
 * 영상 생성은 느리고(컷당 수십 초~수 분) 비싸다. 그래서 기본은 'manual'이고,
 * 프리셋/컷에서 video 모드를 명시적으로 켠 컷만 여기로 온다.
 */

export interface VideoResult {
  video: Buffer;
  extension: "mp4";
  mime: string;
}

export interface VideoProvider {
  id: VideoProviderId;
  label: string;
  envKeys: string[];
  isConfigured(): boolean;
  generate(args: {
    prompt: string;
    aspect: Aspect;
    durationSec: number;
    model: string;
  }): Promise<VideoResult>;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const veo: VideoProvider = {
  id: "gemini-veo",
  label: "Google Veo",
  envKeys: ["GEMINI_VIDEO_API_KEY", "GEMINI_VIDEO_MODEL"],
  isConfigured: () => Boolean(process.env.GEMINI_VIDEO_API_KEY),

  async generate({ prompt, aspect, model }) {
    const apiKey = process.env.GEMINI_VIDEO_API_KEY ?? "";
    const modelId =
      model || process.env.GEMINI_VIDEO_MODEL || "veo-3.0-generate-preview";
    const base = "https://generativelanguage.googleapis.com/v1beta";

    // 영상 생성은 장기 작업이다. 시작 → 폴링 → 결과 파일 내려받기.
    const start = await fetch(`${base}/models/${modelId}:predictLongRunning`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { aspectRatio: aspect, personGeneration: "allow_adult" },
      }),
    });
    if (!start.ok) throw await httpError("Veo 영상 생성 시작", start);

    const { name } = (await start.json()) as { name?: string };
    if (!name) throw new Error("Veo: 작업 이름을 받지 못했습니다.");

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const poll = await fetch(`${base}/${name}`, {
        headers: { "x-goog-api-key": apiKey },
      });
      if (!poll.ok) throw await httpError("Veo 작업 조회", poll);

      const op = (await poll.json()) as {
        done?: boolean;
        error?: { message?: string };
        response?: {
          generateVideoResponse?: {
            generatedSamples?: Array<{ video?: { uri?: string } }>;
          };
        };
      };
      if (!op.done) continue;
      if (op.error) throw new Error(`Veo 실패: ${op.error.message ?? "사유 미상"}`);

      const uri =
        op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!uri) {
        throw new Error(
          `Veo 응답에서 영상 URI를 찾지 못했습니다: ${JSON.stringify(op).slice(0, 300)}`,
        );
      }

      const file = await fetch(uri, { headers: { "x-goog-api-key": apiKey } });
      if (!file.ok) throw await httpError("Veo 영상 내려받기", file);
      return {
        video: Buffer.from(await file.arrayBuffer()),
        extension: "mp4",
        mime: "video/mp4",
      };
    }
    throw new Error("Veo: 생성 대기 시간이 초과됐습니다.");
  },
};

const manual: VideoProvider = {
  id: "manual",
  label: "직접 넣기 (모션 프롬프트만 생성)",
  envKeys: [],
  isConfigured: () => true,
  async generate() {
    throw new Error(
      "이 프리셋의 영상 생성이 '직접 넣기'입니다. 모션 프롬프트를 복사해 쓰신 뒤 컷에 영상을 업로드하세요.",
    );
  },
};

export const VIDEO_ADAPTERS: VideoProvider[] = [veo, manual];

/** 구독 웹을 영상 생성기로 쓴다 — API 키가 필요 없다. */
async function makeWebVideo(recipeId: string): Promise<VideoProvider> {
  const recipe = await getMediaRecipe(recipeId);
  if (!recipe) throw new Error(`웹 레시피 "${recipeId}"를 찾을 수 없습니다.`);
  if (recipe.kind !== "video") {
    throw new Error(`"${recipe.label}"은(는) 영상용 레시피가 아닙니다.`);
  }

  return {
    id: `web:${recipe.id}`,
    label: `${recipe.label} (웹)`,
    envKeys: [],
    isConfigured: () => true,
    async generate({ prompt, aspect }) {
      const media = await fetchMedia(recipe, `${prompt} Aspect ratio ${aspect}.`);
      return { video: media.data, extension: "mp4", mime: media.mime };
    },
  };
}

export async function getVideoProvider(id: VideoProviderId): Promise<VideoProvider> {
  if (isWebProvider(id)) return makeWebVideo(webRecipeIdOf(id));
  const provider = VIDEO_ADAPTERS.find((p) => p.id === id);
  if (!provider) throw new Error(`알 수 없는 영상 제공자: ${id}`);
  return provider;
}

export async function videoChoices() {
  const recipes = await listMediaRecipes();
  return [
    ...VIDEO_ADAPTERS.map((p) => ({
      id: p.id, label: p.label, kind: "builtin" as const,
      needsApiKey: p.envKeys.length > 0, configured: p.isConfigured(),
    })),
    ...recipes.filter((r) => r.kind === "video").map((r) => ({
      id: `web:${r.id}`, label: `${r.label} (웹)`, kind: "web" as const,
      needsApiKey: false, configured: true,
    })),
  ];
}

export const videoStatus = () =>
  VIDEO_ADAPTERS.map((p) => ({
    id: p.id,
    label: p.label,
    envKeys: p.envKeys,
    configured: p.isConfigured(),
  }));

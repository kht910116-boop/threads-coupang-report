import { isWebProvider, webRecipeIdOf, type Aspect, type ImageProviderId } from "@/lib/types";
import { fetchMedia } from "./web/driver";
import { getMediaRecipe, listMediaRecipes } from "./web/media";
import { httpError } from "./tts/types";

/**
 * 이미지 생성 어댑터.
 *
 * 'manual'이 기본값이다 — 키가 없어도 앱은 돌아가고, 프롬프트만 뽑아준다.
 * 그 프롬프트를 미드저니든 어디든 넣고 결과 이미지를 컷에 업로드하면 된다.
 */

export interface ImageResult {
  image: Buffer;
  extension: "png" | "jpg";
  mime: string;
}

export interface ImageProvider {
  id: ImageProviderId;
  label: string;
  envKeys: string[];
  isConfigured(): boolean;
  generate(args: {
    prompt: string;
    aspect: Aspect;
    model: string;
  }): Promise<ImageResult>;
}

/** gpt-image-1이 받는 크기로 화면비를 옮긴다. */
const OPENAI_SIZE: Record<Aspect, string> = {
  "9:16": "1024x1536",
  "16:9": "1536x1024",
  "1:1": "1024x1024",
};

const gemini: ImageProvider = {
  id: "gemini",
  label: "Gemini 이미지",
  envKeys: ["GEMINI_IMAGE_API_KEY", "GEMINI_IMAGE_MODEL"],
  isConfigured: () => Boolean(process.env.GEMINI_IMAGE_API_KEY),

  async generate({ prompt, aspect, model }) {
    const modelId =
      model || process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": process.env.GEMINI_IMAGE_API_KEY ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: aspect },
          },
        }),
      },
    );
    if (!response.ok) throw await httpError("Gemini 이미지 생성", response);

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
        };
      }>;
    };
    const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
      ?.inlineData;
    if (!inline?.data) {
      throw new Error(
        `Gemini 이미지 응답이 비었습니다: ${JSON.stringify(data).slice(0, 300)}`,
      );
    }
    return {
      image: Buffer.from(inline.data, "base64"),
      extension: inline.mimeType?.includes("jpeg") ? "jpg" : "png",
      mime: inline.mimeType ?? "image/png",
    };
  },
};

const openai: ImageProvider = {
  id: "openai",
  label: "OpenAI 이미지",
  envKeys: ["OPENAI_API_KEY"],
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),

  async generate({ prompt, aspect, model }) {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model || "gpt-image-1",
        prompt,
        size: OPENAI_SIZE[aspect],
        n: 1,
      }),
    });
    if (!response.ok) throw await httpError("OpenAI 이미지 생성", response);

    const data = (await response.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI 이미지 응답이 비었습니다.");
    return { image: Buffer.from(b64, "base64"), extension: "png", mime: "image/png" };
  },
};

const manual: ImageProvider = {
  id: "manual",
  label: "직접 넣기 (프롬프트만 생성)",
  envKeys: [],
  isConfigured: () => true,
  async generate() {
    throw new Error(
      "이 프리셋의 이미지 생성이 '직접 넣기'입니다. 프롬프트를 복사해서 쓰신 뒤 컷에 이미지를 업로드하세요.",
    );
  },
};

export const IMAGE_ADAPTERS: ImageProvider[] = [gemini, openai, manual];

/** 구독 웹을 이미지 생성기로 쓴다 — API 키가 필요 없다. */
async function makeWebImage(recipeId: string): Promise<ImageProvider> {
  const recipe = await getMediaRecipe(recipeId);
  if (!recipe) throw new Error(`웹 레시피 "${recipeId}"를 찾을 수 없습니다.`);
  if (recipe.kind !== "image") {
    throw new Error(`"${recipe.label}"은(는) 이미지용 레시피가 아닙니다.`);
  }

  return {
    id: `web:${recipe.id}`,
    label: `${recipe.label} (웹)`,
    envKeys: [],
    isConfigured: () => true,
    async generate({ prompt, aspect }) {
      // 웹 UI에는 화면비 설정이 따로 없는 경우가 많아 프롬프트에 실어 보낸다.
      const media = await fetchMedia(recipe, `${prompt} Aspect ratio ${aspect}.`);
      return {
        image: media.data,
        extension: media.extension === "jpg" ? "jpg" : "png",
        mime: media.mime,
      };
    },
  };
}

export async function getImageProvider(id: ImageProviderId): Promise<ImageProvider> {
  if (isWebProvider(id)) return makeWebImage(webRecipeIdOf(id));
  const provider = IMAGE_ADAPTERS.find((p) => p.id === id);
  if (!provider) throw new Error(`알 수 없는 이미지 제공자: ${id}`);
  return provider;
}

export async function imageChoices() {
  const recipes = await listMediaRecipes();
  return [
    ...IMAGE_ADAPTERS.map((p) => ({
      id: p.id, label: p.label, kind: "builtin" as const,
      needsApiKey: p.envKeys.length > 0, configured: p.isConfigured(),
    })),
    ...recipes.filter((r) => r.kind === "image").map((r) => ({
      id: `web:${r.id}`, label: `${r.label} (웹)`, kind: "web" as const,
      needsApiKey: false, configured: true,
    })),
  ];
}

export const imageStatus = () =>
  IMAGE_ADAPTERS.map((p) => ({
    id: p.id,
    label: p.label,
    envKeys: p.envKeys,
    configured: p.isConfigured(),
  }));

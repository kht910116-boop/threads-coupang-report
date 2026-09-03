import {
  httpError,
  pcmToWav,
  sampleRateFromMime,
  type TtsProvider,
} from "./types";

/**
 * Google AI Studio (Gemini) TTS.
 * 헤더 없는 raw PCM을 base64로 주기 때문에 WAV 헤더를 씌워서 돌려준다.
 *
 * 속도·피치 파라미터가 따로 없어서, 원하는 톤은 프롬프트로 지시한다.
 */

const MODEL = () => process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";

/**
 * 글 엔진이 쓰는 키를 그대로 쓴다.
 *
 * 둘 다 같은 생성 API(generativelanguage.googleapis.com)를 부르므로 키가 같다.
 * 같은 값을 두 칸에 붙여넣게 하는 것은 사용자에게 설명할 수 없는 요구다.
 * 전용 키를 따로 쓰고 싶으면 GOOGLE_AI_STUDIO_API_KEY가 이긴다.
 */
const apiKey = () =>
  process.env.GOOGLE_AI_STUDIO_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY ?? "";

/** Gemini는 속도를 숫자로 안 받는다 — 말로 시킨다. */
function paceInstruction(speed: number): string {
  if (speed >= 1.15) return "Say this quickly and energetically";
  if (speed >= 1.05) return "Say this at a slightly brisk pace";
  if (speed <= 0.85) return "Say this slowly and calmly";
  if (speed <= 0.95) return "Say this at a slightly slow, relaxed pace";
  return "Say this at a natural pace";
}

export const googleAiStudio: TtsProvider = {
  id: "google-ai-studio",
  label: "Google AI Studio (Gemini TTS)",
  envKeys: ["GOOGLE_AI_STUDIO_API_KEY", "GEMINI_TTS_MODEL"],

  models: [
    { id: "gemini-2.5-flash-preview-tts", name: "2.5 Flash TTS", note: "권장 — 무료 한도가 여기 있습니다" },
    { id: "gemini-2.5-pro-preview-tts", name: "2.5 Pro TTS", note: "품질이 높지만 무료 한도에서는 막힐 수 있습니다" },
  ],
  isConfigured: () => Boolean(apiKey()),

  async synthesize({ text, voiceId, speed, model }) {
    const voiceName = voiceId || "Kore";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || MODEL()}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${paceInstruction(speed)}: ${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        }),
      },
    );
    if (!response.ok) throw await httpError("Gemini TTS", response);

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
        `Gemini TTS 응답에 오디오가 없습니다: ${JSON.stringify(data).slice(0, 300)}`,
      );
    }

    const pcm = Buffer.from(inline.data, "base64");
    return {
      audio: pcmToWav(pcm, sampleRateFromMime(inline.mimeType ?? "")),
      extension: "wav",
      mime: "audio/wav",
    };
  },
};

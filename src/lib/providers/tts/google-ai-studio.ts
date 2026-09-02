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
  isConfigured: () => Boolean(process.env.GOOGLE_AI_STUDIO_API_KEY),

  async synthesize({ text, voiceId, speed }) {
    const voiceName = voiceId || "Kore";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": process.env.GOOGLE_AI_STUDIO_API_KEY ?? "",
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

import { httpError, type TtsProvider } from "./types";

/** Google Cloud Text-to-Speech (API 키 방식). */

const BASE = "https://texttospeech.googleapis.com/v1";
const key = () => process.env.GOOGLE_CLOUD_TTS_API_KEY ?? "";

/** "ko-KR-Neural2-C" 같은 이름에서 언어 코드를 앞 두 토막으로 뽑는다. */
function languageCodeFromVoice(voiceId: string, fallbackLanguage: string): string {
  const parts = voiceId.split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return fallbackLanguage === "ko" ? "ko-KR" : fallbackLanguage;
}

export const googleCloud: TtsProvider = {
  id: "google-cloud",
  label: "Google Cloud TTS",
  envKeys: ["GOOGLE_CLOUD_TTS_API_KEY"],
  isConfigured: () => Boolean(process.env.GOOGLE_CLOUD_TTS_API_KEY),

  async listVoices() {
    const response = await fetch(
      `${BASE}/voices?key=${encodeURIComponent(key())}&languageCode=ko-KR`,
    );
    if (!response.ok) throw await httpError("Google Cloud TTS 목소리 목록", response);

    const data = (await response.json()) as {
      voices?: Array<{
        name: string;
        ssmlGender?: string;
        languageCodes?: string[];
      }>;
    };
    return (data.voices ?? []).map((voice) => ({
      id: voice.name,
      name: voice.name,
      detail: [voice.ssmlGender, voice.languageCodes?.join(",")]
        .filter(Boolean)
        .join(" · "),
    }));
  },

  async synthesize({ text, voiceId, speed, pitch, language }) {
    const name = voiceId || "ko-KR-Neural2-C";

    const response = await fetch(
      `${BASE}/text:synthesize?key=${encodeURIComponent(key())}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: languageCodeFromVoice(name, language), name },
          audioConfig: {
            audioEncoding: "MP3",
            // 허용 범위를 벗어나면 400이 난다.
            speakingRate: Math.min(4, Math.max(0.25, speed)),
            pitch: Math.min(20, Math.max(-20, pitch)),
          },
        }),
      },
    );
    if (!response.ok) throw await httpError("Google Cloud TTS 음성 합성", response);

    const data = (await response.json()) as { audioContent?: string };
    if (!data.audioContent) {
      throw new Error("Google Cloud TTS 응답에 audioContent가 없습니다.");
    }
    return {
      audio: Buffer.from(data.audioContent, "base64"),
      extension: "mp3",
      mime: "audio/mpeg",
    };
  },
};

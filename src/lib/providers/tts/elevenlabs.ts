import { httpError, type TtsProvider } from "./types";

const BASE = "https://api.elevenlabs.io/v1";

export const elevenlabs: TtsProvider = {
  id: "elevenlabs",
  label: "ElevenLabs",
  envKeys: ["ELEVENLABS_API_KEY"],

  models: [
    { id: "eleven_multilingual_v2", name: "Multilingual v2", note: "권장 — 한국어가 가장 안정적입니다" },
    { id: "eleven_turbo_v2_5", name: "Turbo v2.5", note: "빠르고 쌉니다. 품질이 조금 내려갑니다" },
    { id: "eleven_flash_v2_5", name: "Flash v2.5", note: "가장 빠릅니다. 긴 대본을 급히 뽑을 때" },
  ],
  isConfigured: () => Boolean(process.env.ELEVENLABS_API_KEY),

  async listVoices() {
    const response = await fetch(`${BASE}/voices`, {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    });
    if (!response.ok) throw await httpError("ElevenLabs 목소리 목록", response);

    const data = (await response.json()) as {
      voices?: Array<{
        voice_id: string;
        name: string;
        labels?: Record<string, string>;
      }>;
    };
    return (data.voices ?? []).map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      detail: Object.values(voice.labels ?? {}).join(" · "),
    }));
  },

  async synthesize({ text, voiceId, speed, model }) {
    if (!voiceId) throw new Error("ElevenLabs: voiceId가 비어 있습니다.");

    const response = await fetch(
      `${BASE}/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: model || process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            // ElevenLabs speed는 0.7~1.2만 받는다.
            speed: Math.min(1.2, Math.max(0.7, speed)),
          },
        }),
      },
    );
    if (!response.ok) throw await httpError("ElevenLabs 음성 합성", response);

    return {
      audio: Buffer.from(await response.arrayBuffer()),
      extension: "mp3",
      mime: "audio/mpeg",
    };
  },
};

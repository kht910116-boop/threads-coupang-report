import { httpError, type SynthesisResult, type TtsProvider } from "./types";

/**
 * 타입캐스트는 세대에 따라 두 가지 응답 방식이 있다.
 *
 *  (A) 동기: 오디오 바이너리를 바로 준다.
 *  (B) 비동기: JSON으로 작업 URL을 주고, 완료될 때까지 폴링한 뒤
 *      audio_download_url에서 받는다.
 *
 * 어느 쪽이 오든 처리하도록 content-type을 보고 갈라진다.
 * 엔드포인트가 다르면 TYPECAST_API_BASE로 덮어쓴다.
 */

const base = () =>
  (process.env.TYPECAST_API_BASE ?? "https://api.typecast.ai").replace(/\/+$/, "");

const headers = () => ({
  "X-API-KEY": process.env.TYPECAST_API_KEY ?? "",
  "content-type": "application/json",
});

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 120_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadFinishedAudio(json: unknown): Promise<SynthesisResult> {
  // 응답 모양이 세대마다 달라 알려진 위치를 순서대로 훑는다.
  const result = (json as { result?: Record<string, unknown> }).result ?? {};
  const statusUrl =
    (result.speak_v2_url as string | undefined) ??
    (result.speak_url as string | undefined);

  if (!statusUrl) {
    throw new Error(
      `타입캐스트 응답에서 작업 URL을 찾지 못했습니다: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const poll = await fetch(statusUrl, { headers: headers() });
    if (!poll.ok) throw await httpError("타입캐스트 작업 조회", poll);

    const status = (await poll.json()) as {
      result?: { status?: string; audio_download_url?: string };
    };
    const state = status.result?.status;

    if (state === "done") {
      const url = status.result?.audio_download_url;
      if (!url) throw new Error("타입캐스트: 완료됐지만 다운로드 URL이 없습니다.");
      const audio = await fetch(url);
      if (!audio.ok) throw await httpError("타입캐스트 오디오 내려받기", audio);
      return {
        audio: Buffer.from(await audio.arrayBuffer()),
        extension: "wav",
        mime: "audio/wav",
      };
    }
    if (state === "failed") {
      throw new Error("타입캐스트: 합성 작업이 실패했습니다.");
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("타입캐스트: 합성 대기 시간이 초과됐습니다.");
}

export const typecast: TtsProvider = {
  id: "typecast",
  label: "타입캐스트",
  envKeys: ["TYPECAST_API_KEY", "TYPECAST_API_BASE"],
  isConfigured: () => Boolean(process.env.TYPECAST_API_KEY),

  async synthesize({ text, voiceId, speed, language, model }) {
    if (!voiceId) throw new Error("타입캐스트: voiceId(actor id)가 비어 있습니다.");

    const response = await fetch(`${base()}/v1/text-to-speech`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        voice_id: voiceId,
        actor_id: voiceId, // 구버전 필드명
        text,
        lang: language === "ko" ? "auto" : language,
        model: model || process.env.TYPECAST_MODEL || "ssfm-v21",
        tempo: speed,
        volume: 100,
        xapi_hd: true,
        model_version: "latest",
        output: { audio_format: "wav" },
      }),
    });
    if (!response.ok) throw await httpError("타입캐스트 음성 합성", response);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return downloadFinishedAudio(await response.json());
    }

    return {
      audio: Buffer.from(await response.arrayBuffer()),
      extension: contentType.includes("mpeg") ? "mp3" : "wav",
      mime: contentType || "audio/wav",
    };
  },
};

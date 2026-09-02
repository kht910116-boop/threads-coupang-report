import type { TtsProviderId } from "@/lib/types";

export interface SynthesizeArgs {
  text: string;
  voiceId: string;
  /** 1.0 = 보통. 각 어댑터가 자기 서비스 범위로 매핑한다. */
  speed: number;
  /** 반음 단위. 지원하지 않는 서비스는 무시한다. */
  pitch: number;
  language: string;
}

export interface SynthesisResult {
  audio: Buffer;
  extension: "mp3" | "wav";
  mime: string;
}

export interface Voice {
  id: string;
  name: string;
  /** 성별·언어·용도 등 서비스가 주는 부가 정보 */
  detail: string;
}

export interface TtsProvider {
  id: TtsProviderId;
  label: string;
  /** 이 어댑터가 쓰는 환경변수 이름들 — UI에서 설정 여부를 보여준다 */
  envKeys: string[];
  isConfigured(): boolean;
  /** 목소리 목록을 못 주는 서비스는 undefined */
  listVoices?: () => Promise<Voice[]>;
  synthesize: (args: SynthesizeArgs) => Promise<SynthesisResult>;
}

/** 응답 본문을 붙여서 던진다 — 어느 어댑터가 왜 실패했는지 바로 보이게. */
export async function httpError(
  label: string,
  response: Response,
): Promise<Error> {
  const body = await response.text().catch(() => "");
  return new Error(
    `${label} 호출 실패 (HTTP ${response.status}) ${body.slice(0, 500)}`,
  );
}

/**
 * Gemini TTS는 헤더 없는 raw PCM(16-bit LE mono)을 준다.
 * 캡컷이나 어떤 편집기든 읽으려면 WAV 헤더를 씌워야 한다.
 */
export function pcmToWav(
  pcm: Buffer,
  sampleRate: number,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM 포맷 청크 크기
  header.writeUInt16LE(1, 20); // 1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** "audio/L16;codec=pcm;rate=24000" 에서 샘플레이트를 뽑는다. */
export function sampleRateFromMime(mime: string, fallback = 24000): number {
  const match = /rate=(\d+)/.exec(mime);
  return match ? Number(match[1]) : fallback;
}

/**
 * 오디오 길이 읽기.
 *
 * 씬을 묶는 기준이 '음성 길이'라서 이 값이 정확해야 한다.
 * ffmpeg을 깔지 않아도 되도록 헤더를 직접 읽는다.
 */

/** WAV는 헤더에 다 적혀 있다 — 정확하다. */
function wavDuration(buffer: Buffer): number | null {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let byteRate = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt " && offset + 16 <= buffer.length) {
      byteRate = buffer.readUInt32LE(offset + 12);
    } else if (chunkId === "data") {
      if (byteRate === 0) return null;
      return chunkSize / byteRate;
    }
    // 청크는 짝수 바이트로 정렬된다.
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return null;
}

// MPEG 오디오 프레임 헤더 해석용 표
const BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const BITRATES_V2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000], // MPEG2.5
};

/**
 * MP3는 길이가 어디에도 안 적혀 있다. 프레임을 세서 더한다.
 * (가변 비트레이트도 이 방식이면 정확하다.)
 */
function mp3Duration(buffer: Buffer): number | null {
  let offset = 0;

  // ID3v2 태그가 앞에 붙어 있으면 건너뛴다.
  if (buffer.length > 10 && buffer.toString("ascii", 0, 3) === "ID3") {
    const size =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    offset = 10 + size;
  }

  let total = 0;
  let frames = 0;

  while (offset + 4 <= buffer.length) {
    // 프레임 동기화 워드: 11비트 연속 1
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const versionBits = (buffer[offset + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerBits = (buffer[offset + 1] >> 1) & 0x03; // 1 = Layer III
    const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
    const padding = (buffer[offset + 2] >> 1) & 0x01;

    const sampleRates = SAMPLE_RATES[versionBits];
    if (
      layerBits !== 1 ||
      !sampleRates ||
      sampleRateIndex === 3 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15
    ) {
      offset += 1;
      continue;
    }

    const sampleRate = sampleRates[sampleRateIndex];
    const bitrate =
      (versionBits === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex] * 1000;
    // MPEG1 Layer III는 프레임당 1152 샘플, MPEG2/2.5는 576 샘플.
    const samplesPerFrame = versionBits === 3 ? 1152 : 576;
    const frameLength =
      Math.floor((samplesPerFrame / 8) * (bitrate / sampleRate)) + padding;

    if (frameLength <= 0) {
      offset += 1;
      continue;
    }

    total += samplesPerFrame / sampleRate;
    frames += 1;
    offset += frameLength;
  }

  return frames > 0 ? total : null;
}

/**
 * 오디오 길이(초). 못 읽으면 null.
 * 호출한 쪽에서 글자수 추정치로 넘어가면 된다.
 */
export function audioDurationSec(buffer: Buffer): number | null {
  return wavDuration(buffer) ?? mp3Duration(buffer);
}

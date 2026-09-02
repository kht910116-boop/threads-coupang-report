/**
 * 응답에서 JSON을 건져낸다.
 *
 * 스키마를 줘도 모델이 코드펜스로 감싸거나 앞뒤에 말을 붙이는 경우가 있다.
 * 웹 UI를 긁어올 때는 특히 흔하다.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(trimmed);
  const candidates = [
    fenced?.[1],
    trimmed,
    // 앞뒤에 말이 붙은 경우 가장 바깥 중괄호 구간만 떼어본다.
    trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // 다음 후보로.
    }
  }
  throw new Error(`응답에서 JSON을 찾지 못했습니다. 앞부분: ${trimmed.slice(0, 300)}`);
}

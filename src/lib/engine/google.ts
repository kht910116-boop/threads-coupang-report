import type { Engine } from "./types";

/**
 * 구글 생성 API 경유 엔진.
 *
 * **이건 이 앱의 원칙(구독만 쓴다)에 대한 의도적 예외다.** 사용자가 무료 한도 안에서
 * 쓰겠다고 정했다. 무료 한도를 넘기면 요금이 붙으니, 이걸 기본 엔진으로 올리거나
 * 대량 작업에 물리지 말 것 — 대본·스토리보드는 `claude` CLI가 구독으로 처리한다.
 *
 * 주소를 환경변수로 열어둬서 AI Studio(생성 언어 API)와 Vertex(에이전트 플랫폼)
 * 양쪽에 같은 코드로 붙는다. 둘은 인증 방식이 다르다.
 *   - AI Studio: API 키를 쿼리로 붙인다. 무료 한도가 여기 있다.
 *   - Vertex: OAuth 토큰이 필요해서 키만으로는 안 된다. GOOGLE_GENAI_BEARER를 준다.
 */

const KEY = () =>
  process.env.GOOGLE_GENAI_API_KEY ?? process.env.GOOGLE_AI_STUDIO_API_KEY ?? "";
const BEARER = () => process.env.GOOGLE_GENAI_BEARER ?? "";
/**
 * 기본 모델.
 *
 * 무료 한도에서 실제로 응답하는 것을 골랐다. 확인해보니 이랬다.
 *   gemini-flash-latest      → OK
 *   gemini-pro-latest        → 429 (무료 한도에 pro 몫이 없다)
 *   gemini-3.1-pro-preview   → 429
 *   gemini-2.5-pro / -flash  → 404 (신규 사용자에게 더 이상 제공 안 함)
 *
 * pro를 쓰고 싶으면 유료 등급 키를 넣고 GOOGLE_GENAI_MODEL로 바꾼다.
 */
const MODEL = () => process.env.GOOGLE_GENAI_MODEL ?? "gemini-flash-latest";
const BASE = () =>
  process.env.GOOGLE_GENAI_BASE ?? "https://generativelanguage.googleapis.com/v1beta";

export const googleEngine: Engine = {
  id: "google",
  label: "Google 생성 API (무료 한도)",
  kind: "api",

  async isAvailable() {
    return Boolean(KEY() || BEARER());
  },

  unavailableReason() {
    return (
      "GOOGLE_GENAI_API_KEY(또는 GOOGLE_AI_STUDIO_API_KEY)가 없습니다. " +
      "AI Studio에서 키를 받아 넣으세요. 무료 한도 안에서만 쓰는 것을 전제로 둔 경로입니다."
    );
  },

  async complete({ system, user, schema, history }): Promise<string> {
    const url = `${BASE()}/models/${MODEL()}:generateContent${
      KEY() ? `?key=${encodeURIComponent(KEY())}` : ""
    }`;

    const contents = [
      ...(history ?? []).map((m) => ({
        // 이 API는 assistant를 model이라고 부른다.
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: user }] },
    ];

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(BEARER() ? { authorization: `Bearer ${BEARER()}` } : {}),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          maxOutputTokens: 16000,
          // 스키마를 네이티브로 받는다. 글로 시키는 것보다 훨씬 잘 지킨다.
          ...(schema
            ? { responseMimeType: "application/json", responseSchema: schema }
            : {}),
        },
      }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // 이 API의 오류는 그대로 보여주면 무슨 일인지 알 수 없다. 흔한 둘을 풀어 쓴다.
      if (response.status === 429) {
        throw new Error(
          `무료 한도를 넘겼거나 이 모델(${MODEL()})에 무료 몫이 없습니다. ` +
            "pro 계열은 무료 등급에서 막혀 있습니다 — GOOGLE_GENAI_MODEL을 " +
            "gemini-flash-latest로 두거나, 구독 CLI(claude 등)로 돌리세요.",
        );
      }
      if (response.status === 404 && /no longer available/i.test(body)) {
        throw new Error(
          `모델 ${MODEL()}은(는) 더 이상 제공되지 않습니다. GOOGLE_GENAI_MODEL을 ` +
            "gemini-flash-latest 같은 현행 모델로 바꾸세요.",
        );
      }
      throw new Error(`구글 생성 API 오류 ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
    };

    if (data.promptFeedback?.blockReason) {
      throw new Error(`모델이 생성을 거부했습니다: ${data.promptFeedback.blockReason}`);
    }

    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new Error("출력이 길이 제한에 걸렸습니다. 목표 길이를 줄여보세요.");
    }

    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
    if (!text.trim()) throw new Error("구글 생성 API가 빈 응답을 냈습니다.");

    // 계약대로 원문을 그대로 돌려준다. JSON 파싱은 부르는 쪽이 한다(types.ts).
    return text;
  },
};

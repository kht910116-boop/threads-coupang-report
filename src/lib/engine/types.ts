/**
 * 엔진 계약.
 *
 * 대본 생성·스토리보드 생성·비서 대화가 전부 이 하나를 쓴다.
 * 엔진이 무엇이든(구독 CLI / 구독 웹 / 종량제 API) 이 인터페이스만 만족하면 된다.
 */

export interface CompleteArgs {
  system: string;
  user: string;
  /**
   * 있으면 JSON 하나만 받고 싶다는 뜻이다.
   * 스키마 플래그를 지원하는 엔진은 그걸 쓰고, 못 쓰는 엔진은
   * 시스템 프롬프트에 스키마를 글로 넣은 뒤 응답에서 JSON을 건져낸다.
   */
  schema?: Record<string, unknown>;
  /** 이전 대화 — 비서 챗에서 쓴다. 지원하지 않는 엔진은 프롬프트에 녹여 넣는다. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface EngineModel {
  id: string;
  label: string;
  note: string;
}

export interface Engine {
  id: string;
  label: string;
  kind: "cli" | "web" | "api";
  /** 고를 수 있는 모델. 비면 화면에 선택이 안 나온다. */
  models?: EngineModel[];
  isAvailable(): Promise<boolean>;
  unavailableReason(): string;
  /** 원문 텍스트를 그대로 돌려준다. JSON 파싱은 호출한 쪽에서 한다. */
  complete(args: CompleteArgs): Promise<string>;
}

/** 스키마 플래그가 없는 엔진에 스키마를 말로 시킨다. */
export function schemaInstruction(schema: Record<string, unknown>): string {
  return [
    "",
    "## 출력 형식 (반드시 지킬 것)",
    "설명·인사말 없이 아래 JSON Schema를 만족하는 **JSON 객체 하나만** 출력한다.",
    "```",
    JSON.stringify(schema),
    "```",
  ].join("\n");
}

/** 대화 기록을 프롬프트 한 덩어리로 눌러 담는다. */
export function flattenHistory(
  history: CompleteArgs["history"],
  user: string,
): string {
  if (!history || history.length === 0) return user;
  return [
    "## 지금까지의 대화",
    ...history.map((m) => `${m.role === "user" ? "사용자" : "너"}: ${m.content}`),
    "",
    `사용자: ${user}`,
  ].join("\n");
}

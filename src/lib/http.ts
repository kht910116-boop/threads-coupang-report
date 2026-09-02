import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** 라우트 핸들러를 감싸서 에러를 사람이 읽는 메시지로 바꿔준다. */
export async function handle<T>(
  fn: () => Promise<T>,
): Promise<NextResponse> {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "입력값이 올바르지 않습니다.",
          detail: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    // 개인용 로컬 도구라 원인을 그대로 보여주는 편이 훨씬 쓸모 있다.
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const notFound = (what: string) =>
  NextResponse.json({ error: `${what}을(를) 찾을 수 없습니다.` }, { status: 404 });

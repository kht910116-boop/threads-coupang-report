import { z } from "zod";
import { handle } from "@/lib/http";
import { getWebRecipe } from "@/lib/providers/web/recipes";
import {
  askWeb,
  checkLoggedIn,
  exportCookies,
  loginToProvider,
} from "@/lib/providers/web/driver";

type Params = { params: Promise<{ id: string }> };

// 로그인 대기와 브라우저 작업은 오래 걸린다.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["login", "check", "cookies", "ask"]),
  /** action이 "ask"일 때 보낼 프롬프트 — 선택자가 맞는지 시험할 때 쓴다. */
  prompt: z.string().default("안녕이라고만 답해줘."),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const recipe = await getWebRecipe(id);
    if (!recipe) throw new Error(`웹 프로바이더 "${id}"를 찾을 수 없습니다.`);

    const { action, prompt } = bodySchema.parse(await request.json());

    switch (action) {
      case "login":
        // 이때만 창이 뜬다. 로그인하고 나면 이후 작업은 전부 백그라운드다.
        return loginToProvider(recipe);
      case "check":
        return { loggedIn: await checkLoggedIn(recipe) };
      case "cookies": {
        // 값 자체는 돌려주지 않는다 — 화면에 세션 쿠키를 뿌릴 이유가 없다.
        const cookies = await exportCookies(recipe);
        return {
          count: cookies.length,
          names: cookies.map((c) => c.name).slice(0, 40),
        };
      }
      case "ask":
        return { answer: await askWeb(recipe, prompt) };
    }
  });
}

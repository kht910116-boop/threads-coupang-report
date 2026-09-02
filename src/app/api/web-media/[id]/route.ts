import { z } from "zod";
import { handle } from "@/lib/http";
import { getMediaRecipe } from "@/lib/providers/web/media";
import { checkLoggedIn, fetchMedia, loginToProvider } from "@/lib/providers/web/driver";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 800;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["login", "check", "test"]),
  /** action이 "test"일 때 넣을 프롬프트 / 읽을 문장 */
  prompt: z.string().default(""),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const recipe = await getMediaRecipe(id);
    if (!recipe) throw new Error(`웹 레시피 "${id}"를 찾을 수 없습니다.`);

    const { action, prompt } = bodySchema.parse(await request.json());

    if (action === "login") return loginToProvider(recipe);
    if (action === "check") return { loggedIn: await checkLoggedIn(recipe) };

    // 선택자가 맞는지 실제로 한 번 뽑아본다. 파일은 저장하지 않고 크기만 본다.
    const fallback =
      recipe.kind === "audio"
        ? "안녕하세요. 테스트 문장입니다."
        : "A simple red apple on a white table, studio lighting.";
    const media = await fetchMedia(recipe, prompt || fallback);
    return {
      bytes: media.data.length,
      extension: media.extension,
      mime: media.mime,
    };
  });
}

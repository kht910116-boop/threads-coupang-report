import { z } from "zod";
import { handle } from "@/lib/http";
import {
  listMediaRecipes,
  mediaRecipeSchema,
  saveMediaRecipes,
} from "@/lib/providers/web/media";

export const dynamic = "force-dynamic";

/** 구독 웹에서 파일을 뽑아오는 레시피(선택자 등) 읽기/쓰기. */
export async function GET() {
  return handle(() => listMediaRecipes());
}

export async function PUT(request: Request) {
  return handle(async () =>
    saveMediaRecipes(z.array(mediaRecipeSchema).parse(await request.json())),
  );
}

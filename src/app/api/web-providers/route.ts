import { z } from "zod";
import { handle } from "@/lib/http";
import {
  listWebRecipes,
  saveWebRecipes,
  webRecipeSchema,
} from "@/lib/providers/web/recipes";

export const dynamic = "force-dynamic";

/** 웹 프로바이더 레시피(선택자 등) 읽기/쓰기. */
export async function GET() {
  return handle(() => listWebRecipes());
}

export async function PUT(request: Request) {
  return handle(async () =>
    saveWebRecipes(z.array(webRecipeSchema).parse(await request.json())),
  );
}

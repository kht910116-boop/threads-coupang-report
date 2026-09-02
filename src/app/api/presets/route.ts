import { handle } from "@/lib/http";
import { createPreset, listPresets } from "@/lib/store";
import { presetInputSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => listPresets());
}

export async function POST(request: Request) {
  return handle(async () =>
    createPreset(presetInputSchema.parse(await request.json())),
  );
}

import { z } from "zod";
import { handle } from "@/lib/http";
import { maskSecret, readSecrets, saveSecrets } from "@/lib/secrets";
import { imageStatus } from "@/lib/providers/image";
import { videoStatus } from "@/lib/providers/video";
import { ttsStatus } from "@/lib/providers/tts";

export const dynamic = "force-dynamic";

/**
 * 화면에서 쓸 API 키 목록.
 *
 * 어떤 키가 필요한지는 **어댑터가 스스로 안다**(envKeys). 여기서 목록을 다시 만들면
 * 어댑터를 추가할 때마다 두 곳을 고쳐야 한다. 그래서 등록소에서 긁어온다.
 */
function knownKeys(): Array<{ key: string; usedBy: string[] }> {
  const byKey = new Map<string, Set<string>>();

  for (const list of [ttsStatus(), imageStatus(), videoStatus()]) {
    for (const provider of list) {
      for (const key of provider.envKeys) {
        if (!byKey.has(key)) byKey.set(key, new Set());
        byKey.get(key)!.add(provider.label);
      }
    }
  }

  // 글 엔진은 등록소를 거치지 않으므로 여기서 보탠다.
  const engineKeys: Record<string, string> = {
    ANTHROPIC_API_KEY: "Anthropic API (종량제)",
    GOOGLE_GENAI_API_KEY: "Google 생성 API (무료 한도)",
  };
  for (const [key, label] of Object.entries(engineKeys)) {
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key)!.add(label);
  }

  return [...byKey].map(([key, usedBy]) => ({ key, usedBy: [...usedBy] }));
}

export async function GET() {
  return handle(async () => {
    const stored = await readSecrets();
    return knownKeys().map(({ key, usedBy }) => ({
      key,
      usedBy,
      // 값은 통째로 내려보내지 않는다. 넣었는지와 끝자리만 보여준다.
      saved: Boolean(stored[key]),
      preview: stored[key] ? maskSecret(stored[key]) : "",
      // .env로 들어온 값은 화면 설정이 못 이긴다. 그걸 알려줘야 헷갈리지 않는다.
      fromEnv: Boolean(process.env[key]) && !stored[key],
    }));
  });
}

const bodySchema = z.record(z.string(), z.string());

export async function PUT(request: Request) {
  return handle(async () => {
    const incoming = bodySchema.parse(await request.json());
    const current = await readSecrets();
    // 빈 문자열은 "안 바꿈"이 아니라 "지움"이다. 화면이 그렇게 보내준다.
    await saveSecrets({ ...current, ...incoming });
    return { ok: true };
  });
}

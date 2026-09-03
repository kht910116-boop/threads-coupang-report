import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, ensureDir } from "@/lib/paths";

/**
 * API 키를 화면에서 넣게 한다.
 *
 * 예전에는 `.env` 파일을 직접 고쳐야 했다. 개발할 때는 그게 편하지만, 이 앱은 이제
 * 설치해서 쓰는 프로그램이라 .env가 설치 폴더 안에 있고 사용자는 그걸 찾을 수 없다.
 * 파일 편집을 요구하는 순간 그 기능은 없는 기능이 된다.
 *
 * 그래서 data/secrets.json에 넣고 화면에서 고친다. data/는 gitignore이므로 키가
 * 저장소에 딸려 들어가지 않는다.
 *
 * **.env가 이긴다.** 이미 환경변수로 들어온 값은 덮어쓰지 않는다 — 개발자가
 * .env로 넣어둔 것을 화면 설정이 몰래 갈아치우면 왜 그 값이 쓰이는지 알 수 없다.
 */

const file = () => path.join(dataDir(), "secrets.json");

export async function readSecrets(): Promise<Record<string, string>> {
  try {
    const raw = JSON.parse(await fs.readFile(file(), "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => [k, v as string]),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function saveSecrets(values: Record<string, string>): Promise<void> {
  await ensureDir(dataDir());
  // 빈 값은 지운다. 빈 문자열이 남아 있으면 '설정됨'으로 잘못 읽힌다.
  const kept = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v.trim() !== ""),
  );
  const tmp = `${file()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(kept, null, 2), "utf8");
  await fs.rename(tmp, file());
  applyToEnv(kept, { overwrite: true });
}

/** 저장된 값을 process.env에 얹는다. 이미 있는 값은 건드리지 않는다. */
function applyToEnv(values: Record<string, string>, opts: { overwrite: boolean }) {
  for (const [key, value] of Object.entries(values)) {
    if (opts.overwrite || !process.env[key]) process.env[key] = value;
  }
}

/**
 * 요청을 처리하기 전에 한 번 불러 둔다.
 *
 * 어댑터들이 process.env를 직접 읽으므로, 그 전에 저장된 키를 얹어야 한다.
 * 매 요청마다 파일을 읽지만 작은 파일이고 개인용 로컬 도구라 문제되지 않는다 —
 * 오히려 화면에서 키를 고친 직후 바로 반영되는 게 낫다.
 */
export async function loadSecretsIntoEnv(): Promise<void> {
  applyToEnv(await readSecrets(), { overwrite: false });
}

/** 화면에 보여줄 형태. 값은 통째로 내려보내지 않는다. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(8)}${value.slice(-4)}`;
}

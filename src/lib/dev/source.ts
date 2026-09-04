import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, ensureDir } from "@/lib/paths";

/**
 * 앱이 자기 소스를 고친다.
 *
 * 비서가 프로젝트(대본·장면)를 고치는 것과는 전혀 다른 일이다. 저쪽은 데이터고
 * 이쪽은 **돌고 있는 프로그램 자체**다. 그래서 규칙이 다르다.
 *
 *   - 소스 폴더를 사용자가 직접 지정해야 한다. 자동으로 찾지 않는다.
 *   - git 저장소가 아니면 거부한다. 되돌릴 방법이 없는 곳은 건드리지 않는다.
 *   - 커밋도 푸시도 하지 않는다. 바꾼 것을 diff로 보여주고 거기서 끝난다.
 *   - **이미 더러운 파일은 비서 것이 아니다.** 실행 전에 목록을 떠 두고, 되돌릴
 *     때는 비서가 새로 건드린 것만 되돌린다. 사용자가 쓰던 작업을 날리면 안 된다.
 *
 * 포장된 앱에는 소스가 없다(컴파일된 서버만 들어 있다). 그래서 이 기능은 소스를
 * 가진 사람에게만 켜진다 — 없으면 왜 없는지 화면에 쓴다.
 */

const configFile = () => path.join(dataDir(), "dev.json");

export interface DevConfig {
  /** 이 앱의 소스가 있는 폴더. 비면 기능이 꺼진다. */
  sourceDir: string;
}

export async function readDevConfig(): Promise<DevConfig> {
  // 환경변수가 이긴다. 개발 중에 띄우면 따로 설정하지 않아도 바로 켜지도록.
  const fromEnv = process.env.AUTOTUBE_SOURCE_DIR?.trim();
  if (fromEnv) return { sourceDir: path.resolve(fromEnv) };
  try {
    const raw = JSON.parse(await fs.readFile(configFile(), "utf8")) as Partial<DevConfig>;
    return { sourceDir: typeof raw.sourceDir === "string" ? raw.sourceDir : "" };
  } catch {
    return { sourceDir: "" };
  }
}

export async function saveDevConfig(config: DevConfig): Promise<DevConfig> {
  await ensureDir(dataDir());
  const kept: DevConfig = { sourceDir: config.sourceDir.trim() };
  await fs.writeFile(configFile(), JSON.stringify(kept, null, 2), "utf8");
  return kept;
}

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** 소스 폴더에서 명령을 돌린다. */
export function runIn(
  cwd: string,
  command: string,
  args: string[],
  timeoutMs = 20 * 60 * 1000,
  extraEnv: Record<string, string> = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    /*
      셸을 거치지 않는다.

      Windows에서 `shell: true`로 두면 cmd가 인자를 다시 파싱한다. 한글이 섞인
      프롬프트가 중간에서 잘려 나갔다 — "greet.ts의 GREETING을…"이 "greet.ts의"에서
      끊겨서, CLI가 무슨 말인지 되물었다. 인자를 그대로 넘겨야 한다.
    */
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command}이(가) ${timeoutMs / 1000}초를 넘겨 멈췄습니다.`));
        return;
      }
      resolve({ stdout, stderr, code });
    });
    child.stdin.end();
  });
}

/** `git status --porcelain` 한 줄에서 경로만 뽑는다. 이름이 바뀐 것은 새 이름을 쓴다. */
function pathOf(line: string): string {
  const rest = line.slice(3);
  const arrow = rest.indexOf(" -> ");
  return (arrow >= 0 ? rest.slice(arrow + 4) : rest).trim().replace(/^"|"$/g, "");
}

export interface SourceState {
  ok: boolean;
  reason: string;
  sourceDir: string;
  branch: string;
  /** 지금 손대져 있는 파일들. 비서가 건드리기 전의 상태다. */
  dirty: string[];
}

export async function inspectSource(): Promise<SourceState> {
  const { sourceDir } = await readDevConfig();
  const blank: SourceState = { ok: false, reason: "", sourceDir, branch: "", dirty: [] };

  if (!sourceDir) {
    return {
      ...blank,
      reason:
        "앱 소스 폴더가 지정되지 않았습니다. 연결 상태 화면에서 이 앱의 소스 폴더를 " +
        "넣으면 비서가 앱을 고칠 수 있습니다. 설치본만 있고 소스가 없으면 쓸 수 없는 기능입니다.",
    };
  }

  try {
    const stat = await fs.stat(sourceDir);
    if (!stat.isDirectory()) {
      return { ...blank, reason: `${sourceDir}는 폴더가 아닙니다.` };
    }
  } catch {
    return { ...blank, reason: `${sourceDir}를 찾을 수 없습니다.` };
  }

  const branch = await runIn(sourceDir, "git", ["rev-parse", "--abbrev-ref", "HEAD"], 30_000);
  if (branch.code !== 0) {
    return {
      ...blank,
      reason:
        `${sourceDir}는 git 저장소가 아닙니다. 되돌릴 방법이 없는 곳은 고치지 않습니다.`,
    };
  }

  const status = await runIn(sourceDir, "git", ["status", "--porcelain"], 30_000);
  return {
    ok: true,
    reason: "",
    sourceDir,
    branch: branch.stdout.trim(),
    dirty: status.stdout.split("\n").filter((l) => l.trim()).map(pathOf),
  };
}

/** 지금 손대져 있는 파일 목록. 실행 전후를 비교하려고 쓴다. */
export async function dirtyFiles(sourceDir: string): Promise<string[]> {
  const status = await runIn(sourceDir, "git", ["status", "--porcelain"], 60_000);
  return status.stdout.split("\n").filter((l) => l.trim()).map(pathOf);
}

/** 추적되지 않는 파일인지. 되돌릴 때 지울지 체크아웃할지가 갈린다. */
export async function untrackedFiles(sourceDir: string): Promise<Set<string>> {
  const status = await runIn(
    sourceDir,
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    60_000,
  );
  return new Set(status.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
}

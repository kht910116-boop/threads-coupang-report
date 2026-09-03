import { spawn } from "node:child_process";
import os from "node:os";
import type { AgentConfig } from "./agents";
import { flattenHistory, schemaInstruction, type Engine } from "./types";

/**
 * 구독제 CLI 에이전트 러너.
 *
 * 구독 요금제는 API 키를 주지 않지만 CLI는 구독 로그인으로 돌아간다.
 * 그래서 API 대신 로컬 바이너리를 부른다. 어느 CLI든 agents.json 설정만
 * 맞으면 붙는다 — 이 파일은 CLI 이름을 하나도 모른다.
 */

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** stdin으로 입력을 넣어야 해서 spawn을 직접 쓴다 (execFile은 stdin을 못 받는다). */
function run(
  command: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
  extraEnv: Record<string, string> = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // 이 앱의 폴더가 아니라 임시 폴더에서 돌린다 —
    // 프로젝트의 설정 파일이나 컨텍스트를 끌고 들어오지 않게.
    // env는 항목마다 다르다. 다계정이 이걸로 갈린다(CODEX_HOME 같은 것).
    const child = spawn(command, args, {
      cwd: os.tmpdir(),
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
        reject(new Error(`${command} 응답이 ${timeoutMs / 1000}초를 넘겼습니다.`));
        return;
      }
      resolve({ stdout, stderr, code });
    });

    // CLI가 stdin을 다 읽기 전에 닫으면 EPIPE가 난다. close 쪽에서 처리한다.
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

/**
 * args의 자리표시자를 채운다.
 *
 * 값이 비어 있는 자리표시자는 그 인자와, 그 앞의 플래그까지 같이 뺀다.
 * (스키마를 지원하지 않는 CLI에서 `--json-schema` 만 덩그러니 남는 걸 막는다.)
 */
function buildArgs(
  template: string[],
  values: Record<string, string>,
): string[] {
  const out: string[] = [];

  for (const raw of template) {
    const placeholder = /^\{\{(\w+)\}\}$/.exec(raw);
    if (placeholder) {
      const value = values[placeholder[1]];
      if (value === undefined || value === "") {
        // 짝이 되는 앞 플래그도 같이 버린다.
        if (out.length > 0 && out[out.length - 1].startsWith("-")) out.pop();
        continue;
      }
      out.push(value);
      continue;
    }
    // 문자열 안에 섞여 있는 자리표시자는 그대로 치환한다.
    out.push(
      raw.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? ""),
    );
  }
  return out;
}

/** "result" 나 "a.b.c" 같은 점 표기로 봉투 안의 값을 꺼낸다. */
function pluck(value: unknown, dotPath: string): unknown {
  if (!dotPath) return value;
  return dotPath
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

/**
 * @param model 고른 모델 id. 비우면 CLI 기본값을 쓴다.
 */
export function makeCliEngine(agent: AgentConfig, model = ""): Engine {
  const chosen = agent.models.find((m) => m.id === model);
  return {
    id: agent.id,
    label: chosen ? `${agent.label} · ${chosen.label}` : agent.label,
    kind: "cli",
    models: agent.models,

    async isAvailable() {
      try {
        const result = await run(agent.command, agent.versionArgs, "", 20_000, agent.env);
        return result.code === 0;
      } catch {
        return false;
      }
    },

    unavailableReason() {
      return `\`${agent.command}\`를 실행할 수 없습니다. 설치돼 있는지, PATH에 있는지, 로그인했는지 확인하세요.`;
    },

    async complete({ system, user, schema, history }): Promise<string> {
      let finalSystem = system;
      let finalUser = flattenHistory(history, user);

      // 스키마 플래그를 못 받는 CLI에는 스키마를 글로 시킨다.
      if (schema && !agent.supportsSchema) {
        finalSystem += schemaInstruction(schema);
      }
      // 시스템 프롬프트 자리가 없는 CLI는 프롬프트 하나로 합쳐 보낸다.
      if (!agent.args.some((a) => a.includes("{{system}}"))) {
        finalUser = `${finalSystem}\n\n---\n\n${finalUser}`;
      }

      const args = buildArgs(agent.args, {
        system: finalSystem,
        user: finalUser,
        schema: schema && agent.supportsSchema ? JSON.stringify(schema) : "",
      });

      // 모델을 골랐을 때만 붙인다. 안 고르면 CLI가 자기 기본값을 쓴다.
      if (chosen) {
        args.push(
          ...agent.modelArgs.map((a) => a.replace(/\{\{model\}\}/g, chosen.id)),
        );
      }

      let result: RunResult;
      try {
        result = await run(
          agent.command,
          args,
          agent.promptVia === "stdin" ? finalUser : "",
          agent.timeoutMs,
          agent.env,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error(
            `\`${agent.command}\`를 찾지 못했습니다. 설치했는지, 또는 설정에서 전체 경로를 넣었는지 확인하세요.`,
          );
        }
        throw error;
      }

      if (!result.stdout.trim()) {
        throw new Error(
          `${agent.label}이(가) 아무것도 출력하지 않았습니다 (종료 코드 ${result.code}). ${result.stderr.trim().slice(0, 400)}`,
        );
      }

      // 봉투가 있으면 벗기고, 없으면 stdout 자체가 답이다.
      if (!agent.resultPath) return result.stdout;

      const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
      if (envelope.is_error === true) {
        throw new Error(
          `${agent.label}이(가) 오류를 냈습니다: ${String(pluck(envelope, agent.resultPath) ?? "")}`,
        );
      }
      const plucked = pluck(envelope, agent.resultPath);
      if (typeof plucked !== "string") {
        throw new Error(
          `${agent.label} 응답의 "${agent.resultPath}" 경로에서 문자열을 찾지 못했습니다. 설정의 resultPath를 확인하세요.`,
        );
      }
      return plucked;
    },
  };
}

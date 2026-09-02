import { spawn } from "node:child_process";
import os from "node:os";
import { z } from "zod";
import { planSchema, type Plan } from "@/lib/types";
import { planUserPrompt, systemPrompt } from "./prompt";
import type { AgentConfig } from "./agents";
import type { PlannerEngine } from "./types";

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
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // 이 앱의 폴더가 아니라 임시 폴더에서 돌린다 —
    // 프로젝트의 설정 파일이나 컨텍스트를 끌고 들어오지 않게.
    const child = spawn(command, args, { cwd: os.tmpdir() });

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

/** 스키마를 줘도 모델이 산문이나 코드펜스로 감싸는 경우가 있어 JSON만 건져낸다. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(trimmed);
  const candidates = [
    fenced?.[1],
    trimmed,
    // 앞뒤에 말이 붙은 경우 가장 바깥 중괄호 구간만 떼어본다.
    trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // 다음 후보로.
    }
  }
  throw new Error(`응답에서 JSON을 찾지 못했습니다. 앞부분: ${trimmed.slice(0, 300)}`);
}

/** 스키마 플래그가 없는 CLI에는 스키마를 말로 시킨다. */
function schemaInstruction(schema: unknown): string {
  return [
    "",
    "## 출력 형식 (반드시 지킬 것)",
    "설명·인사·코드펜스 없이 아래 JSON Schema를 만족하는 **JSON 객체 하나만** 출력한다.",
    "```",
    JSON.stringify(schema),
    "```",
  ].join("\n");
}

export function makeCliEngine(agent: AgentConfig): PlannerEngine {
  return {
    id: "cli",
    label: agent.label,

    async isAvailable() {
      try {
        const result = await run(agent.command, agent.versionArgs, "", 20_000);
        return result.code === 0;
      } catch {
        return false;
      }
    },

    unavailableReason() {
      return `\`${agent.command}\`를 실행할 수 없습니다. 설치돼 있는지, PATH에 있는지, 로그인했는지 확인하세요.`;
    },

    async generatePlan({ preset, topic, brief }): Promise<Plan> {
      // CLI들이 $schema 키가 붙어 있으면 스키마를 거부하는 경우가 있다.
      const { $schema: _drop, ...schema } = z.toJSONSchema(planSchema) as Record<
        string,
        unknown
      >;

      let system = systemPrompt(preset);
      let user = planUserPrompt(topic, brief);

      if (!agent.supportsSchema) {
        system += schemaInstruction(schema);
      }
      // 시스템 프롬프트를 받는 자리가 없는 CLI는 프롬프트 하나로 합쳐 보낸다.
      const takesSystem = agent.args.some((a) => a.includes("{{system}}"));
      if (!takesSystem) {
        user = `${system}\n\n---\n\n${user}`;
      }

      const values: Record<string, string> = {
        system,
        user,
        schema: agent.supportsSchema ? JSON.stringify(schema) : "",
      };
      const args = buildArgs(agent.args, values);

      let result: RunResult;
      try {
        result = await run(
          agent.command,
          args,
          agent.promptVia === "stdin" ? user : "",
          agent.timeoutMs,
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
      let answer: string;
      if (agent.resultPath) {
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
        answer = plucked;
      } else {
        answer = result.stdout;
      }

      return planSchema.parse(extractJson(answer));
    },
  };
}

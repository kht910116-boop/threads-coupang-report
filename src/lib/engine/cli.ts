import { spawn } from "node:child_process";
import os from "node:os";
import { z } from "zod";
import { planSchema, type Plan } from "@/lib/types";
import { planUserPrompt, systemPrompt } from "./prompt";
import type { PlannerEngine } from "./types";

/**
 * Claude Code CLI 경유 기획 엔진 — **구독제용 경로**.
 *
 * Claude Pro/Max 구독은 API 키를 주지 않는다. 하지만 Claude Code는 구독 로그인으로
 * 동작하고, `-p`(헤드리스) 모드와 `--json-schema`(구조화 출력)를 지원한다.
 * 그래서 API 대신 로컬에 깔린 `claude` 바이너리를 불러서 같은 결과를 받는다.
 *
 * 사전 준비: 터미널에서 `claude` 실행 → `/login`으로 구독 계정 로그인 한 번.
 */

const CLI = () => process.env.CLAUDE_CLI_PATH ?? "claude";
const TIMEOUT_MS = 15 * 60 * 1000;

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** stdin으로 입력을 넣어야 해서 spawn을 직접 쓴다 (execFile은 stdin을 못 받는다). */
function run(args: string[], stdin: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // 이 앱의 폴더가 아니라 임시 폴더에서 돌린다 —
    // 프로젝트의 CLAUDE.md나 설정을 끌고 들어오지 않게.
    const child = spawn(CLI(), args, { cwd: os.tmpdir() });

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
        reject(new Error(`Claude Code CLI 응답이 ${timeoutMs / 1000}초를 넘겼습니다.`));
        return;
      }
      resolve({ stdout, stderr, code });
    });

    child.stdin.on("error", () => {
      // CLI가 stdin을 다 읽기 전에 닫으면 EPIPE가 난다. close 쪽에서 처리한다.
    });
    child.stdin.end(stdin);
  });
}

/** CLI가 `--output-format json`으로 감싸서 주는 봉투. */
const envelopeSchema = z.object({
  type: z.string(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
});

/**
 * 프롬프트가 길어서 인자로 넘기면 OS 인자 길이 제한에 걸릴 수 있다.
 * 사용자 프롬프트는 stdin으로 넣고, 시스템 프롬프트만 인자로 준다.
 */
async function callCli(args: {
  system: string;
  user: string;
  schema: unknown;
}): Promise<string> {
  const argv = [
    "-p",
    "--system-prompt", args.system,
    "--json-schema", JSON.stringify(args.schema),
    "--output-format", "json",
    // 기획에는 도구가 필요 없다. 꺼두면 파일을 뒤지거나 헤매지 않는다.
    "--tools", "",
    "--strict-mcp-config",
  ];
  if (process.env.CLAUDE_CLI_MODEL) argv.push("--model", process.env.CLAUDE_CLI_MODEL);

  let result: RunResult;
  try {
    result = await run(argv, args.user, TIMEOUT_MS);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Claude Code CLI(\`${CLI()}\`)를 찾지 못했습니다. 설치했는지, 또는 CLAUDE_CLI_PATH에 전체 경로를 넣었는지 확인하세요.`,
      );
    }
    throw error;
  }

  if (!result.stdout.trim()) {
    throw new Error(
      `Claude Code CLI가 아무것도 출력하지 않았습니다 (종료 코드 ${result.code}). ${result.stderr.trim().slice(0, 400)}`,
    );
  }

  const envelope = envelopeSchema.parse(JSON.parse(result.stdout));
  if (envelope.is_error || envelope.subtype !== "success") {
    throw new Error(
      `Claude Code CLI가 오류를 냈습니다 (${envelope.subtype ?? "unknown"}): ${envelope.result ?? ""}`.trim(),
    );
  }
  if (!envelope.result) throw new Error("Claude Code CLI가 빈 응답을 줬습니다.");
  return envelope.result;
}

/** 스키마를 줘도 모델이 코드펜스로 감싸는 경우가 있어 한 번 벗겨준다. */
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "")
    : trimmed;
  return JSON.parse(unfenced);
}

export const cliEngine: PlannerEngine = {
  id: "cli",
  label: "Claude Code CLI (구독제)",

  async isAvailable() {
    try {
      const result = await run(["--version"], "", 20_000);
      return result.code === 0;
    } catch {
      return false;
    }
  },

  unavailableReason() {
    return `Claude Code CLI(\`${CLI()}\`)를 찾지 못했습니다. 설치 후 \`claude\`를 한 번 실행해 /login으로 구독 계정에 로그인하세요.`;
  },

  async generatePlan({ preset, topic, brief }): Promise<Plan> {
    // CLI는 $schema 키가 붙어 있으면 스키마를 거부한다.
    const { $schema: _drop, ...schema } = z.toJSONSchema(planSchema) as Record<
      string,
      unknown
    >;

    const raw = await callCli({
      system: systemPrompt(preset),
      user: planUserPrompt(topic, brief),
      schema,
    });

    let parsed: unknown;
    try {
      parsed = parseJsonLoose(raw);
    } catch {
      throw new Error(
        `Claude Code CLI 응답이 JSON이 아닙니다. 앞부분: ${raw.slice(0, 300)}`,
      );
    }
    return planSchema.parse(parsed);
  },
};

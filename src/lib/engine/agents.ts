import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { dataDir, ensureDir } from "@/lib/paths";

/**
 * CLI 에이전트 레지스트리.
 *
 * 구독제로 쓰는 AI들(Claude, Codex, Grok, Antigravity …)은 API 키를 주지 않지만
 * 대부분 헤드리스로 돌릴 수 있는 CLI를 제공한다. 이 앱은 그 CLI를 호출한다.
 *
 * CLI마다 플래그가 다르므로 **코드가 아니라 설정으로** 다룬다.
 * data/agents.json을 고치면 새 CLI가 붙는다 — 코드 수정 없이.
 *
 * args 안에서 쓸 수 있는 자리표시자:
 *   {{system}}  시스템 프롬프트
 *   {{user}}    사용자 프롬프트 (promptVia가 "arg"일 때)
 *   {{schema}}  JSON Schema 문자열 (supportsSchema가 true일 때)
 *
 * 자리표시자를 포함한 인자는 값이 비면 그 인자와 짝이 되는 플래그까지 통째로 빠진다.
 */

export const agentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** 실행할 바이너리. PATH에 없으면 전체 경로를 쓴다. */
  command: z.string().min(1),
  args: z.array(z.string()),
  /** 사용자 프롬프트를 stdin으로 넣을지, args의 {{user}} 자리에 넣을지 */
  promptVia: z.enum(["stdin", "arg"]).default("stdin"),
  /** JSON Schema 플래그를 지원하는지. false면 스키마를 시스템 프롬프트에 글로 넣는다. */
  supportsSchema: z.boolean().default(false),
  /**
   * stdout이 JSON 봉투일 때 실제 답이 들어 있는 경로 (점 표기, 예: "result").
   * 비우면 stdout 전체를 답으로 본다.
   */
  resultPath: z.string().default(""),
  /** 설치 여부 확인용 인자 */
  versionArgs: z.array(z.string()).default(["--version"]),
  timeoutMs: z.number().int().positive().default(15 * 60 * 1000),
  /** 이 환경에서 실제로 돌려서 확인했는지 — UI에 표시된다 */
  verified: z.boolean().default(false),
  notes: z.string().default(""),
});

export type AgentConfig = z.infer<typeof agentSchema>;

/**
 * 기본 레지스트리.
 *
 * claude만 이 저장소에서 실제로 돌려 확인했다. 나머지는 **형태만 잡아둔 초안**이고,
 * 각 CLI의 실제 플래그에 맞게 고쳐야 한다. 설정 화면이나 data/agents.json에서
 * 바로 고칠 수 있고, 고치고 나면 verified를 true로 바꿔두면 된다.
 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: "claude",
    label: "Claude Code (구독)",
    command: "claude",
    args: [
      "-p",
      "--system-prompt", "{{system}}",
      "--json-schema", "{{schema}}",
      "--output-format", "json",
      // 기획에는 도구가 필요 없다. 꺼두면 파일을 뒤지거나 헤매지 않는다.
      "--tools", "",
      "--strict-mcp-config",
    ],
    promptVia: "stdin",
    supportsSchema: true,
    resultPath: "result",
    versionArgs: ["--version"],
    timeoutMs: 15 * 60 * 1000,
    verified: true,
    notes: "`claude` 실행 후 /login 으로 구독 계정 로그인 한 번이면 된다.",
  },
  {
    id: "codex",
    label: "OpenAI Codex CLI (구독)",
    command: "codex",
    args: ["exec", "--skip-git-repo-check", "{{user}}"],
    promptVia: "arg",
    supportsSchema: false,
    resultPath: "",
    versionArgs: ["--version"],
    timeoutMs: 15 * 60 * 1000,
    verified: false,
    notes:
      "미검증 초안. 실제 플래그를 확인해 args를 고칠 것. 시스템 프롬프트를 따로 받는 플래그가 있으면 {{system}}을 넣고, 없으면 지금처럼 사용자 프롬프트 앞에 합쳐진다.",
  },
  {
    id: "grok",
    label: "Grok CLI (구독)",
    command: "grok",
    args: ["-p", "{{user}}"],
    promptVia: "arg",
    supportsSchema: false,
    resultPath: "",
    versionArgs: ["--version"],
    timeoutMs: 15 * 60 * 1000,
    verified: false,
    notes: "미검증 초안. 실제 플래그를 확인해 args를 고칠 것.",
  },
  {
    id: "antigravity",
    label: "Antigravity (구독)",
    command: "antigravity",
    args: ["{{user}}"],
    promptVia: "arg",
    supportsSchema: false,
    resultPath: "",
    versionArgs: ["--version"],
    timeoutMs: 15 * 60 * 1000,
    verified: false,
    notes:
      "미검증 초안. 헤드리스 실행을 지원하는지부터 확인이 필요하다. 안 되면 이 항목은 지워도 된다.",
  },
];

const agentsFile = () => path.join(dataDir(), "agents.json");

async function readAgents(): Promise<AgentConfig[] | null> {
  try {
    const raw = JSON.parse(await fs.readFile(agentsFile(), "utf8")) as unknown[];
    return raw
      .map((item) => agentSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeAgents(agents: AgentConfig[]): Promise<void> {
  await ensureDir(dataDir());
  const tmp = `${agentsFile()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(agents, null, 2), "utf8");
  await fs.rename(tmp, agentsFile());
}

/** 저장된 설정을 읽되, 아직 없는 기본 항목은 합쳐 넣는다 (기존 항목은 건드리지 않는다). */
export async function listAgents(): Promise<AgentConfig[]> {
  const stored = await readAgents();
  if (stored === null) {
    await writeAgents(DEFAULT_AGENTS);
    return DEFAULT_AGENTS;
  }
  const known = new Set(stored.map((a) => a.id));
  const missing = DEFAULT_AGENTS.filter((a) => !known.has(a.id));
  if (missing.length > 0) {
    const merged = [...stored, ...missing];
    await writeAgents(merged);
    return merged;
  }
  return stored;
}

export async function getAgent(id: string): Promise<AgentConfig | null> {
  return (await listAgents()).find((a) => a.id === id) ?? null;
}

/** 설정 화면에서 통째로 저장한다. */
export async function saveAgents(agents: AgentConfig[]): Promise<AgentConfig[]> {
  const parsed = agents.map((a) => agentSchema.parse(a));
  await writeAgents(parsed);
  return parsed;
}

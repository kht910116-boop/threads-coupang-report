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
  /**
   * 이 항목을 실행할 때만 얹는 환경변수.
   *
   * **다계정을 이걸로 한다.** 구독 CLI는 대개 홈 디렉터리 하나에 로그인 정보를
   * 넣어두므로, 그 경로만 갈아끼우면 같은 CLI를 계정별로 따로 쓸 수 있다.
   *
   *   codex   → CODEX_HOME
   *   claude  → CLAUDE_CONFIG_DIR
   *
   * 그래서 계정 하나당 항목 하나를 만든다. id와 label만 다르고 나머지는 같다.
   * 코드는 어떤 변수가 무슨 뜻인지 몰라도 된다 — 설정이 다 정한다.
   */
  env: z.record(z.string(), z.string()).default({}),
  /**
   * 이 CLI가 고를 수 있는 모델.
   *
   * 코드에 모델 이름을 박지 않는다. CLI마다 이름도 플래그도 다르고, 모델은
   * 몇 달에 한 번씩 바뀐다 — 그때마다 코드를 고치면 설계가 틀린 것이다.
   * 목록이 비어 있으면 화면에 모델 선택이 안 나오고 CLI 기본값을 쓴다.
   */
  models: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        note: z.string().default(""),
      }),
    )
    .default([]),
  /**
   * 모델을 고를 때 덧붙일 인자. {{model}} 자리에 고른 id가 들어간다.
   *
   * args가 아니라 따로 두는 이유는, 모델을 안 고르면 이 인자들이 통째로
   * 빠져야 하기 때문이다. args에 섞어두면 `--model` 만 덩그러니 남는다.
   */
  modelArgs: z.array(z.string()).default([]),
  /**
   * 코드를 고치라고 시킬 때 쓰는 인자. {{user}} 자리에 요청이 들어간다.
   *
   * 대화용 args와 다른 이유는, 대화에서는 도구를 끄고(`--tools ""`) 임시 폴더에서
   * 돌리기 때문이다. 코드를 고치려면 파일을 읽고 쓸 수 있어야 하고 저장소 안에서
   * 돌아야 한다. 비우면 그 CLI는 대화만 하고 코드는 못 고친다.
   */
  patchArgs: z.array(z.string()).default([]),
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
 * 네 항목 모두 이 PC에서 실제로 돌려 확인했다 — 헤드리스로 한 번씩 물어보고,
 * 답이 stdout 어디로 나오는지까지 봤다. 잡음이 stderr로 가는지 stdout에 섞이는지는
 * 도움말만 봐서는 알 수 없어서 직접 갈라 봐야 했다.
 *
 * antigravity는 뺐다. 이 PC에 설치돼 있지 않아 확인할 방법이 없었고, 확인 못 한
 * 초안을 목록에 두면 사용자가 골랐다가 실패한다. 쓰는 사람이 있으면 화면에서
 * 추가하면 된다.
 *
 * 새 CLI를 붙일 때 확인할 것은 셋이다 — 프롬프트를 stdin으로 받는지(긴 대본이
 * 인자 길이 제한에 걸린다), 스키마 플래그가 인라인 문자열인지 파일인지,
 * 답이 stdout에 단독으로 나오는지.
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
    env: {},
    versionArgs: ["--version"],
    timeoutMs: 15 * 60 * 1000,
    verified: true,
    models: [
      { id: "opus", label: "Opus", note: "가장 똑똑합니다. 대본·구조처럼 판단이 필요한 일에" },
      { id: "sonnet", label: "Sonnet", note: "권장 — 빠르고 충분합니다" },
      { id: "haiku", label: "Haiku", note: "가장 빠르고 쌉니다. 짧은 질문에" },
      { id: "fable", label: "Fable", note: "글맛을 살리는 모델" },
    ],
    modelArgs: ["--model", "{{model}}"],
    // acceptEdits는 파일 수정만 허용한다. bypassPermissions가 아니다 —
    // 돌고 있는 프로그램의 소스라서 위험한 것은 계속 막혀 있어야 한다.
    patchArgs: ["-p", "{{user}}", "--permission-mode", "acceptEdits"],
    notes: "`claude` 실행 후 /login 으로 구독 계정 로그인 한 번이면 된다.",
  },
  {
    id: "codex",
    label: "OpenAI Codex CLI (구독)",
    command: "codex",
    args: [
      "exec",
      "--skip-git-repo-check",
      // 세션 파일을 남기지 않는다. 이 앱은 매번 새 요청이라 이어갈 대화가 없다.
      "--ephemeral",
      // 대본을 쓰는 데 파일을 고칠 이유가 없다.
      "-s", "read-only",
      "--color", "never",
    ],
    // 프롬프트를 인자로 넘기면 긴 대본에서 명령줄 길이 제한에 걸린다. stdin으로 넣는다.
    promptVia: "stdin",
    // --output-schema는 있지만 **파일 경로**를 받는다. 우리 러너는 스키마를 문자열로
    // 치환하므로 그대로는 못 쓴다. 스키마는 시스템 프롬프트에 글로 넣는다.
    supportsSchema: false,
    // 답만 stdout으로 나온다. 실행 정보·훅·토큰 수는 전부 stderr다. 확인함.
    resultPath: "",
    // 계정을 더 붙이려면 이 항목을 복제하고 CODEX_HOME만 다른 폴더로 준다.
    env: {},
    versionArgs: ["--version"],
    timeoutMs: 15 * 60 * 1000,
    verified: true,
    models: [],
    modelArgs: ["--model", "{{model}}"],
    // workspace-write는 이 폴더 안에서만 쓰게 한다. 밖은 못 건드린다.
    patchArgs: ["exec", "-s", "workspace-write", "{{user}}"],
    notes:
      "codex-cli 0.152.1에서 확인. `codex` 실행 후 ChatGPT 계정으로 로그인 한 번이면 된다.",
  },
  {
    id: "grok",
    label: "Grok CLI (구독)",
    command: "grok",
    args: [
      "-p", "{{user}}",
      // claude와 같은 방식으로 인라인 JSON Schema를 받는다.
      "--json-schema", "{{schema}}",
      "--output-format", "json",
    ],
    // -p가 프롬프트를 인자로만 받는다. stdin 경로가 문서에 없다.
    promptVia: "arg",
    supportsSchema: true,
    // 응답 봉투의 답 필드. thought·usage·cost가 같이 온다.
    resultPath: "text",
    env: {},
    versionArgs: ["--version"],
    timeoutMs: 15 * 60 * 1000,
    verified: true,
    models: [],
    modelArgs: ["--model", "{{model}}"],
    // 코드를 고치는 플래그를 이 PC에서 확인하지 못했다. 확인 못 한 설정을
    // 넣어두면 사용자가 골랐다가 실패한다. 쓰는 사람이 화면에서 넣으면 된다.
    patchArgs: [],
    notes:
      "grok 1.0.13에서 확인. 프롬프트가 인자로 들어가므로 아주 긴 대본에서는 명령줄 " +
      "길이 제한에 걸릴 수 있다. 그럴 때는 codex나 claude를 쓸 것.",
  },
  {
    id: "opencode",
    label: "OpenCode (구독)",
    command: "opencode",
    args: ["run"],
    promptVia: "stdin",
    supportsSchema: false,
    // 답만 stdout으로 나온다. 모델 정보는 stderr다. 확인함.
    resultPath: "",
    env: {},
    versionArgs: ["--version"],
    timeoutMs: 15 * 60 * 1000,
    verified: true,
    models: [],
    modelArgs: ["--model", "{{model}}"],
    // 코드를 고치는 플래그를 이 PC에서 확인하지 못했다. 확인 못 한 설정을
    // 넣어두면 사용자가 골랐다가 실패한다. 쓰는 사람이 화면에서 넣으면 된다.
    patchArgs: [],
    notes: "opencode 1.18.25에서 확인. `opencode providers`로 쓸 모델을 붙여둬야 한다.",
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

  /*
    이미 저장된 항목에 새로 생긴 칸을 채워 넣는다.

    설정 파일은 앱보다 오래 산다. 모델 선택을 나중에 붙였는데 저장된 파일에는
    그 칸이 없어서, 쓰던 사람에게는 기능이 아예 없는 것처럼 보였다. 사용자가
    직접 넣은 값은 건드리지 않고 **비어 있는 칸만** 기본값으로 메운다.
  */
  const filled = stored.map((agent) => {
    const base = DEFAULT_AGENTS.find((d) => d.id === agent.id);
    if (!base) return agent;
    const next = { ...agent };
    let touched = false;
    if (next.models.length === 0 && next.modelArgs.length === 0 && base.models.length > 0) {
      next.models = base.models;
      next.modelArgs = base.modelArgs;
      touched = true;
    }
    if (next.patchArgs.length === 0 && base.patchArgs.length > 0) {
      next.patchArgs = base.patchArgs;
      touched = true;
    }
    return touched ? next : agent;
  });

  const changed =
    missing.length > 0 || filled.some((a, i) => a !== stored[i]);
  if (changed) {
    const merged = [...filled, ...missing];
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

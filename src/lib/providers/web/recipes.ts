import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { dataDir, ensureDir } from "@/lib/paths";

/**
 * 웹 프로바이더 레시피.
 *
 * 구독 웹 서비스(ChatGPT, Claude, Gemini, Grok, Perplexity …)를 백그라운드
 * 브라우저로 조작한다. 사이트마다 DOM이 다르고 수시로 바뀌므로 **선택자를
 * 코드에 박지 않는다** — 여기 설정만 고치면 된다.
 *
 * 아래 기본 레시피는 전부 **미검증 초안**이다. 이 저장소에서는 해당 사이트에
 * 접속할 수 없어 선택자를 확인할 방법이 없었다. 각자 환경에서 열어보고
 * 고쳐야 하며, 연결 상태 화면에서 바로 편집할 수 있다.
 */

export const webRecipeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** 대화를 시작할 주소. 매번 새 대화로 열리는 주소가 좋다. */
  url: z.string().url(),
  /** 프롬프트를 넣을 입력창. textarea든 contenteditable이든 상관없다. */
  promptSelector: z.string().min(1),
  /** "enter"면 엔터로 보내고, 그 밖의 값은 클릭할 버튼의 선택자로 본다. */
  submit: z.string().default("enter"),
  /** 답변이 담기는 요소. 여러 개면 마지막 것을 쓴다. */
  responseSelector: z.string().min(1),
  /** 답변 텍스트가 이 시간(ms)만큼 변하지 않으면 완료로 본다. */
  stableMs: z.number().int().positive().default(2500),
  timeoutMs: z.number().int().positive().default(5 * 60 * 1000),
  /** 로그인 확인용 — 이 선택자가 보이면 로그인된 상태로 본다. 비우면 확인하지 않는다. */
  loggedInSelector: z.string().default(""),
  verified: z.boolean().default(false),
  notes: z.string().default(""),
});

export type WebRecipe = z.infer<typeof webRecipeSchema>;

const UNVERIFIED =
  "미검증 초안. 해당 사이트를 열어 개발자도구로 실제 선택자를 확인하고 고칠 것.";

export const DEFAULT_WEB_RECIPES: WebRecipe[] = [
  {
    id: "chatgpt",
    label: "ChatGPT (구독)",
    url: "https://chatgpt.com/",
    promptSelector: "#prompt-textarea",
    submit: "enter",
    responseSelector: "[data-message-author-role='assistant']",
    stableMs: 2500,
    timeoutMs: 300000,
    loggedInSelector: "#prompt-textarea",
    verified: false,
    notes: UNVERIFIED,
  },
  {
    id: "claude-web",
    label: "Claude 웹 (구독)",
    url: "https://claude.ai/new",
    promptSelector: "div[contenteditable='true']",
    submit: "enter",
    responseSelector: "[data-testid='assistant-message'], .font-claude-response",
    stableMs: 2500,
    timeoutMs: 300000,
    loggedInSelector: "div[contenteditable='true']",
    verified: false,
    notes: UNVERIFIED,
  },
  {
    id: "gemini",
    label: "Gemini (구독)",
    url: "https://gemini.google.com/app",
    promptSelector: "rich-textarea div[contenteditable='true']",
    submit: "enter",
    responseSelector: "model-response",
    stableMs: 2500,
    timeoutMs: 300000,
    loggedInSelector: "rich-textarea",
    verified: false,
    notes: UNVERIFIED,
  },
  {
    id: "grok",
    label: "Grok (구독)",
    url: "https://grok.com/",
    promptSelector: "textarea",
    submit: "enter",
    responseSelector: "[class*='message-bubble']",
    stableMs: 2500,
    timeoutMs: 300000,
    loggedInSelector: "textarea",
    verified: false,
    notes: UNVERIFIED,
  },
  {
    id: "perplexity",
    label: "Perplexity (구독)",
    url: "https://www.perplexity.ai/",
    promptSelector: "textarea, div[contenteditable='true']",
    submit: "enter",
    responseSelector: "[class*='prose']",
    stableMs: 3000,
    timeoutMs: 300000,
    loggedInSelector: "",
    verified: false,
    notes: UNVERIFIED,
  },
];

const recipesFile = () => path.join(dataDir(), "web-providers.json");

async function readRecipes(): Promise<WebRecipe[] | null> {
  try {
    const raw = JSON.parse(await fs.readFile(recipesFile(), "utf8")) as unknown[];
    return raw
      .map((item) => webRecipeSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeRecipes(recipes: WebRecipe[]): Promise<void> {
  await ensureDir(dataDir());
  const tmp = `${recipesFile()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(recipes, null, 2), "utf8");
  await fs.rename(tmp, recipesFile());
}

/** 저장된 레시피를 읽되, 아직 없는 기본 항목만 합쳐 넣는다. */
export async function listWebRecipes(): Promise<WebRecipe[]> {
  const stored = await readRecipes();
  if (stored === null) {
    await writeRecipes(DEFAULT_WEB_RECIPES);
    return DEFAULT_WEB_RECIPES;
  }
  const known = new Set(stored.map((r) => r.id));
  const missing = DEFAULT_WEB_RECIPES.filter((r) => !known.has(r.id));
  if (missing.length > 0) {
    const merged = [...stored, ...missing];
    await writeRecipes(merged);
    return merged;
  }
  return stored;
}

export async function getWebRecipe(id: string): Promise<WebRecipe | null> {
  return (await listWebRecipes()).find((r) => r.id === id) ?? null;
}

export async function saveWebRecipes(recipes: WebRecipe[]): Promise<WebRecipe[]> {
  const parsed = recipes.map((r) => webRecipeSchema.parse(r));
  await writeRecipes(parsed);
  return parsed;
}

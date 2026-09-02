import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { dataDir, ensureDir } from "@/lib/paths";

/**
 * 구독 웹에서 **파일**을 뽑아오는 레시피.
 *
 * 챗 레시피(recipes.ts)는 글자를 받아온다. 이건 이미지·음성·영상 파일을 받아온다.
 * API 키를 쓰지 않고 구독만으로 3·5·6단계를 돌리기 위한 경로다.
 *
 * 결과를 가져오는 방법이 사이트마다 둘로 갈린다:
 *   element  — 결과가 <img>/<audio>/<video>로 화면에 뜬다. src를 읽어 받아온다.
 *   download — 다운로드 버튼을 누르면 파일이 떨어진다. 그 다운로드를 가로챈다.
 *
 * 여기 기본값은 **전부 미검증 초안**이다. 이 저장소에서는 해당 사이트에 접속할 수
 * 없어 선택자를 확인할 방법이 없었다. 연결 상태 화면에서 고쳐 쓴다.
 */

export const MEDIA_KINDS = ["image", "audio", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const mediaRecipeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(MEDIA_KINDS),
  url: z.string().url(),

  /** 프롬프트(또는 읽을 문장)를 넣을 입력창 */
  promptSelector: z.string().min(1),
  /** "enter" 또는 클릭할 버튼 선택자 */
  submit: z.string().default("enter"),

  /** 결과를 가져오는 방식 */
  extract: z.enum(["element", "download"]).default("element"),
  /** extract=element일 때: 결과 요소(img/audio/video). 여러 개면 마지막 것. */
  resultSelector: z.string().default(""),
  /** extract=download일 때: 누르면 파일이 떨어지는 버튼 */
  downloadSelector: z.string().default(""),

  /** 생성 전에 눌러둬야 하는 것들 (설정 열기, 모델 고르기 등) */
  preClickSelectors: z.array(z.string()).default([]),

  timeoutMs: z.number().int().positive().default(5 * 60 * 1000),
  /** 결과가 나온 뒤 이만큼 더 기다린다 — 저해상도 미리보기가 먼저 뜨는 사이트가 있다. */
  settleMs: z.number().int().min(0).default(1500),
  loggedInSelector: z.string().default(""),
  verified: z.boolean().default(false),
  notes: z.string().default(""),
});

export type MediaRecipe = z.infer<typeof mediaRecipeSchema>;

const UNVERIFIED =
  "미검증 초안. 사이트를 열어 개발자도구로 실제 선택자를 확인하고 고칠 것. '시험' 버튼으로 바로 확인할 수 있다.";

export const DEFAULT_MEDIA_RECIPES: MediaRecipe[] = [
  {
    id: "gemini-image",
    label: "Gemini 이미지 (구독)",
    kind: "image",
    url: "https://gemini.google.com/app",
    promptSelector: "rich-textarea div[contenteditable='true']",
    submit: "enter",
    extract: "element",
    resultSelector: "generated-image img, img[alt*='생성']",
    downloadSelector: "",
    preClickSelectors: [],
    timeoutMs: 300000,
    settleMs: 2000,
    loggedInSelector: "rich-textarea",
    verified: false,
    notes: UNVERIFIED,
  },
  {
    id: "chatgpt-image",
    label: "ChatGPT 이미지 (구독)",
    kind: "image",
    url: "https://chatgpt.com/",
    promptSelector: "#prompt-textarea",
    submit: "enter",
    extract: "element",
    resultSelector: "[data-message-author-role='assistant'] img",
    downloadSelector: "",
    preClickSelectors: [],
    timeoutMs: 300000,
    settleMs: 2000,
    loggedInSelector: "#prompt-textarea",
    verified: false,
    notes: `${UNVERIFIED} 이미지를 그려달라는 말을 프롬프트 앞에 붙여야 할 수 있다.`,
  },
  {
    id: "elevenlabs-web",
    label: "ElevenLabs 음성 (구독)",
    kind: "audio",
    url: "https://elevenlabs.io/app/speech-synthesis",
    promptSelector: "textarea",
    submit: "button[type='submit']",
    extract: "download",
    resultSelector: "audio",
    downloadSelector: "button[aria-label*='ownload'], button:has-text('Download')",
    preClickSelectors: [],
    timeoutMs: 300000,
    settleMs: 1000,
    loggedInSelector: "textarea",
    verified: false,
    notes: `${UNVERIFIED} 목소리는 사이트에서 미리 골라두면 그대로 쓰인다.`,
  },
  {
    id: "typecast-web",
    label: "타입캐스트 음성 (구독)",
    kind: "audio",
    url: "https://typecast.ai/",
    promptSelector: "textarea, div[contenteditable='true']",
    submit: "enter",
    extract: "download",
    resultSelector: "audio",
    downloadSelector: "button:has-text('다운로드'), button:has-text('Download')",
    preClickSelectors: [],
    timeoutMs: 300000,
    settleMs: 1000,
    loggedInSelector: "",
    verified: false,
    notes: UNVERIFIED,
  },
];

const recipesFile = () => path.join(dataDir(), "web-media.json");

async function readRecipes(): Promise<MediaRecipe[] | null> {
  try {
    const raw = JSON.parse(await fs.readFile(recipesFile(), "utf8")) as unknown[];
    return raw
      .map((item) => mediaRecipeSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeRecipes(recipes: MediaRecipe[]): Promise<void> {
  await ensureDir(dataDir());
  const tmp = `${recipesFile()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(recipes, null, 2), "utf8");
  await fs.rename(tmp, recipesFile());
}

export async function listMediaRecipes(): Promise<MediaRecipe[]> {
  const stored = await readRecipes();
  if (stored === null) {
    await writeRecipes(DEFAULT_MEDIA_RECIPES);
    return DEFAULT_MEDIA_RECIPES;
  }
  const known = new Set(stored.map((r) => r.id));
  const missing = DEFAULT_MEDIA_RECIPES.filter((r) => !known.has(r.id));
  if (missing.length > 0) {
    const merged = [...stored, ...missing];
    await writeRecipes(merged);
    return merged;
  }
  return stored;
}

export async function getMediaRecipe(id: string): Promise<MediaRecipe | null> {
  return (await listMediaRecipes()).find((r) => r.id === id) ?? null;
}

export async function saveMediaRecipes(recipes: MediaRecipe[]): Promise<MediaRecipe[]> {
  const parsed = recipes.map((r) => mediaRecipeSchema.parse(r));
  await writeRecipes(parsed);
  return parsed;
}

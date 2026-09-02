import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { dataDir, ensureDir } from "@/lib/paths";
import type { WebRecipe } from "./recipes";

/**
 * 백그라운드 브라우저 드라이버.
 *
 * 설계 원칙 두 가지:
 *
 *  1. **사용자 PC 사용을 방해하지 않는다.** 프로바이더마다 전용 프로파일 폴더를
 *     쓰고 헤드리스로 돌린다. 평소 쓰는 브라우저는 건드리지 않고, 창이 뜨거나
 *     포커스를 뺏지 않는다.
 *  2. **로그인은 한 번만.** 최초 1회 창을 띄워 직접 로그인하면 세션이 프로파일에
 *     남는다. 이후 실행은 그 세션을 재사용한다. 같은 프로파일에서 쿠키를 꺼내
 *     쿠키 방식 호출에도 쓴다.
 *
 * 주의: 크롬은 같은 프로파일 폴더를 동시에 두 번 열지 못한다.
 * 로그인 창이 떠 있는 동안에는 그 프로바이더로 작업을 돌릴 수 없다.
 */

const profileDir = (providerId: string) =>
  path.join(dataDir(), "browser-profiles", providerId);

/**
 * 어떤 브라우저를 쓸지.
 *
 * BROWSER_EXECUTABLE이 있으면 그걸 쓰고, 없으면 설치된 크롬 채널을 쓴다.
 * 사용자가 평소 쓰는 크롬을 그대로 쓰되 **프로파일만 분리**하는 게 핵심이다.
 */
function launchOptions(headless: boolean) {
  const executablePath = process.env.BROWSER_EXECUTABLE;
  return {
    headless,
    ...(executablePath ? { executablePath } : { channel: "chrome" as const }),
    args: [
      // 자동화 배너와 기본 자동화 티를 줄인다.
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
    viewport: { width: 1280, height: 900 },
  };
}

async function openContext(
  providerId: string,
  headless: boolean,
): Promise<BrowserContext> {
  const dir = profileDir(providerId);
  await ensureDir(dir);
  try {
    return await chromium.launchPersistentContext(dir, launchOptions(headless));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/executable doesn't exist|channel|ENOENT/i.test(message)) {
      throw new Error(
        `브라우저를 실행하지 못했습니다. 크롬이 설치돼 있는지 확인하거나, BROWSER_EXECUTABLE에 실행 파일 경로를 넣으세요. (원인: ${message.slice(0, 200)})`,
      );
    }
    if (/ProcessSingleton|already (running|in use)|SingletonLock/i.test(message)) {
      throw new Error(
        `이 프로바이더의 브라우저 프로파일이 이미 열려 있습니다. 로그인 창을 닫고 다시 시도하세요.`,
      );
    }
    throw error;
  }
}

/**
 * 최초 1회 로그인.
 *
 * 창을 띄워 두고, 로그인 확인 선택자가 보이거나 시간이 다 될 때까지 기다린다.
 * 이때만 화면에 창이 뜬다. 이후 작업 실행은 전부 헤드리스다.
 */
export async function loginToProvider(
  recipe: WebRecipe,
  waitMs = 5 * 60 * 1000,
): Promise<{ loggedIn: boolean }> {
  const context = await openContext(recipe.id, false);
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(recipe.url, { waitUntil: "domcontentloaded" });

    if (!recipe.loggedInSelector) {
      // 확인할 선택자가 없으면 사용자가 창을 닫을 때까지 기다린다.
      await page.waitForEvent("close", { timeout: waitMs }).catch(() => {});
      return { loggedIn: true };
    }

    await page.waitForSelector(recipe.loggedInSelector, { timeout: waitMs });
    return { loggedIn: true };
  } catch {
    return { loggedIn: false };
  } finally {
    await context.close();
  }
}

/** 로그인돼 있는지 헤드리스로 조용히 확인한다. */
export async function checkLoggedIn(recipe: WebRecipe): Promise<boolean> {
  if (!recipe.loggedInSelector) return false;
  let context: BrowserContext | null = null;
  try {
    context = await openContext(recipe.id, true);
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(recipe.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(recipe.loggedInSelector, { timeout: 20000 });
    return true;
  } catch {
    return false;
  } finally {
    await context?.close().catch(() => {});
  }
}

/** 프로파일에 남아 있는 세션 쿠키를 꺼낸다 — 쿠키 방식 호출에 쓴다. */
export async function exportCookies(
  recipe: WebRecipe,
): Promise<Array<{ name: string; value: string; domain: string }>> {
  const context = await openContext(recipe.id, true);
  try {
    const cookies = await context.cookies(recipe.url);
    return cookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain }));
  } finally {
    await context.close();
  }
}

/** 프롬프트 입력창에 글을 넣는다. textarea와 contenteditable을 모두 다룬다. */
async function fillPrompt(page: Page, selector: string, text: string): Promise<void> {
  const target = page.locator(selector).first();
  await target.waitFor({ state: "visible", timeout: 60000 });
  await target.click();

  const isTextarea = await target.evaluate(
    (el) => el.tagName === "TEXTAREA" || el.tagName === "INPUT",
  );
  if (isTextarea) {
    await target.fill(text);
    return;
  }
  // contenteditable에 여러 줄을 넣을 때 엔터를 치면 전송돼 버린다.
  // 붙여넣기처럼 한 번에 삽입한다.
  await target.evaluate((el, value) => {
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, text);
}

/**
 * 답변이 멈출 때까지 기다린다.
 *
 * 사이트마다 '생성 완료' 표시가 제각각이라 그걸 알아내는 대신,
 * **답변 텍스트가 일정 시간 변하지 않으면 완료**로 본다. 어느 사이트에서든 통한다.
 */
async function waitForStableAnswer(
  page: Page,
  selector: string,
  stableMs: number,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const readLast = async (): Promise<string> => {
    const nodes = page.locator(selector);
    const count = await nodes.count();
    if (count === 0) return "";
    return (await nodes.nth(count - 1).innerText()).trim();
  };

  let previous = "";
  let unchangedSince = 0;

  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const current = await readLast().catch(() => previous);

    if (current !== previous) {
      previous = current;
      unchangedSince = Date.now();
      continue;
    }
    // 아직 아무것도 안 나왔으면 '안 변한 것'으로 치지 않는다.
    if (current === "") continue;
    if (unchangedSince === 0) unchangedSince = Date.now();
    if (Date.now() - unchangedSince >= stableMs) return current;
  }

  if (previous) return previous; // 시간이 다 됐지만 뭐라도 나왔으면 그걸 쓴다.
  throw new Error(
    `${timeoutMs / 1000}초 안에 답변이 나오지 않았습니다. responseSelector가 맞는지 확인하세요.`,
  );
}

/**
 * 백그라운드로 한 번 물어보고 답을 받아온다.
 * 이 함수가 도는 동안 화면에는 아무것도 뜨지 않는다.
 */
export async function askWeb(recipe: WebRecipe, prompt: string): Promise<string> {
  const context = await openContext(recipe.id, true);
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(recipe.url, { waitUntil: "domcontentloaded", timeout: 90000 });

    if (recipe.loggedInSelector) {
      const ready = await page
        .waitForSelector(recipe.loggedInSelector, { timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      if (!ready) {
        throw new Error(
          `${recipe.label}에 로그인돼 있지 않은 것 같습니다. 연결 상태 화면에서 '로그인'을 눌러 한 번 로그인하세요.`,
        );
      }
    }

    await fillPrompt(page, recipe.promptSelector, prompt);

    if (recipe.submit === "enter") {
      await page.keyboard.press("Enter");
    } else {
      await page.locator(recipe.submit).first().click();
    }

    return await waitForStableAnswer(
      page,
      recipe.responseSelector,
      recipe.stableMs,
      recipe.timeoutMs,
    );
  } finally {
    await context.close();
  }
}

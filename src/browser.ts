import { chromium, Browser, Page } from "playwright";
import { BASE_URL } from "./siteApi.js";
import { ResolvedTarget } from "./types.js";

const NAV_TIMEOUT_MS = 20_000;

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // Chromium's own sandbox commonly can't start in a default (non-privileged)
    // Docker container — the container's isolation substitutes for it there.
    // Opt-in only via env var so the non-Docker/host setup stays fully sandboxed.
    const noSandbox = process.env.PLAYWRIGHT_CHROMIUM_NO_SANDBOX === "1";
    browserPromise = chromium.launch({
      headless: true,
      args: noSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    });
  }
  return browserPromise;
}

interface PooledPage {
  page: Page;
  lock: Promise<void>;
}

const pages = new Map<string, PooledPage>();

function targetKey(target: ResolvedTarget): string {
  return `${target.product}/${target.version}/${target.lang}`;
}

function contentUrl(target: ResolvedTarget, id?: string): string {
  const params = new URLSearchParams({
    product: target.product,
    version: target.version,
    lang: target.lang,
  });
  if (id) params.set("id", id);
  return `${BASE_URL}/Content.html?${params.toString()}`;
}

async function createPage(target: ResolvedTarget): Promise<Page> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(contentUrl(target), { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector('input[placeholder="Search" i]', { timeout: NAV_TIMEOUT_MS });
  return page;
}

/**
 * Runs `fn` with exclusive access to a warm zenHelpViewer page for the
 * given product/version/lang, reusing an already-loaded page when
 * available. Concurrent calls for the same target are serialized so they
 * don't race on the same page; different targets get independent pages.
 * If `fn` throws, the page is dropped from the pool so the next call gets
 * a fresh one (guards against a page left in a broken state).
 */
export async function withPage<T>(
  target: ResolvedTarget,
  fn: (page: Page, gotoTopic: (id: string) => Promise<void>) => Promise<T>
): Promise<T> {
  const key = targetKey(target);
  let entry = pages.get(key);
  if (!entry) {
    const page = await createPage(target);
    entry = { page, lock: Promise.resolve() };
    pages.set(key, entry);
  }

  const gotoTopic = async (id: string) => {
    await entry!.page.goto(contentUrl(target, id), {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
  };

  const previousLock = entry.lock;
  const run = previousLock.then(() => fn(entry!.page, gotoTopic));
  entry.lock = run.then(
    () => undefined,
    () => undefined
  );

  try {
    return await run;
  } catch (err) {
    pages.delete(key);
    entry.page.close().catch(() => {});
    throw err;
  }
}

export async function closeBrowser(): Promise<void> {
  pages.clear();
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close();
  }
}

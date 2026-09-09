import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResolvedTarget } from "../../src/types.js";

// `browser.ts` imports `chromium` directly from "playwright" with no
// injection seam, so exercising its page-pooling/locking logic requires
// mocking the whole module. vi.mock factories are hoisted above imports, so
// any values they close over must come from vi.hoisted().
const { launchMock } = vi.hoisted(() => ({ launchMock: vi.fn() }));
vi.mock("playwright", () => ({
  chromium: { launch: launchMock },
  Browser: {},
  Page: {},
}));

function makeTarget(overrides: Partial<ResolvedTarget> = {}): ResolvedTarget {
  return { product: "supervisor", version: "1600", lang: "en", ...overrides };
}

function makeFakePage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakeContext() {
  return {
    newPage: vi.fn().mockImplementation(async () => makeFakePage()),
  };
}

function makeFakeBrowser() {
  return {
    newContext: vi.fn().mockImplementation(async () => makeFakeContext()),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// browser.ts also keeps module-level mutable state (the browser singleton
// promise and the page pool). Re-importing after vi.resetModules() gives
// each test a clean instance instead of leaking pooled pages across tests.
async function freshBrowserModule() {
  vi.resetModules();
  return import("../../src/browser.js");
}

describe("browser withPage/closeBrowser", () => {
  beforeEach(() => {
    launchMock.mockReset();
  });

  it("reuses a pooled page for the same target across sequential calls", async () => {
    const fakeBrowser = makeFakeBrowser();
    launchMock.mockResolvedValue(fakeBrowser);
    const { withPage } = await freshBrowserModule();
    const target = makeTarget();

    const page1 = await withPage(target, async (page) => page);
    const page2 = await withPage(target, async (page) => page);

    expect(page1).toBe(page2);
    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(fakeBrowser.newContext).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent calls for the same target's pooled page", async () => {
    const fakeBrowser = makeFakeBrowser();
    launchMock.mockResolvedValue(fakeBrowser);
    const { withPage } = await freshBrowserModule();
    const target = makeTarget();

    // Warm the pool so both calls below hit the existing-entry lock path
    // rather than racing on initial page creation.
    await withPage(target, async () => {});

    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withPage(target, async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
    });
    const second = withPage(target, async () => {
      order.push("second-start");
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("creates independent pages for different targets sharing one browser", async () => {
    const fakeBrowser = makeFakeBrowser();
    launchMock.mockResolvedValue(fakeBrowser);
    const { withPage } = await freshBrowserModule();
    const targetA = makeTarget({ product: "supervisor" });
    const targetB = makeTarget({ product: "com" });

    const [pageA, pageB] = await Promise.all([
      withPage(targetA, async (page) => page),
      withPage(targetB, async (page) => page),
    ]);

    expect(pageA).not.toBe(pageB);
    expect(fakeBrowser.newContext).toHaveBeenCalledTimes(2);
    expect(launchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts and closes the page when the handler throws, so the next call gets a fresh page", async () => {
    const fakeBrowser = makeFakeBrowser();
    launchMock.mockResolvedValue(fakeBrowser);
    const { withPage } = await freshBrowserModule();
    const target = makeTarget();

    let firstPage: ReturnType<typeof makeFakePage> | undefined;
    await expect(
      withPage(target, async (page) => {
        firstPage = page as unknown as ReturnType<typeof makeFakePage>;
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(firstPage?.close).toHaveBeenCalledTimes(1);
    expect(fakeBrowser.newContext).toHaveBeenCalledTimes(1);

    let secondPage: unknown;
    await withPage(target, async (page) => {
      secondPage = page;
    });

    expect(secondPage).not.toBe(firstPage);
    expect(fakeBrowser.newContext).toHaveBeenCalledTimes(2);
  });

  it("closeBrowser clears the pool and closes the underlying browser", async () => {
    const fakeBrowser = makeFakeBrowser();
    launchMock.mockResolvedValue(fakeBrowser);
    const { withPage, closeBrowser } = await freshBrowserModule();
    const target = makeTarget();
    await withPage(target, async () => {});

    await closeBrowser();

    expect(fakeBrowser.close).toHaveBeenCalledTimes(1);
  });
});

// Opt-in live-site smoke test, see search.live.test.ts for rationale. Run
// with `npm run test:live` after `npx playwright install chromium`.
import { afterAll, describe, expect, it } from "vitest";
import { closeBrowser } from "../../src/browser.js";
import { fetchTopic } from "../../src/fetchTopic.js";
import { searchDocs } from "../../src/search.js";
import { resolveTarget } from "../../src/siteApi.js";

describe("fetchTopic (live)", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it("fetches and converts a real topic to markdown", async () => {
    const target = await resolveTarget("supervisor", undefined, "en");
    const [firstResult] = await searchDocs(target, "alarm administration");
    expect(firstResult).toBeDefined();

    const result = await fetchTopic(firstResult.url);

    expect(result.title.length).toBeGreaterThan(0);
    expect(result.markdown.length).toBeGreaterThan(0);
    expect(result.sourceUrl).toBe(firstResult.url);
  }, 30_000);
});

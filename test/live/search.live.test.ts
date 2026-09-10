// Opt-in live-site smoke test: launches a real Chromium via Playwright and
// hits the real onlinehelp.copadata.com site. Not run by `npm test` or in
// Docker (slow, network-dependent, and depends on the real site's DOM/React
// tree matching search.ts's selectors and fiber-walking logic). Run with
// `npm run test:live` after `npx playwright install chromium`.
import { afterAll, describe, expect, it } from "vitest";
import { closeBrowser } from "../../src/sources/zenon/browser.js";
import { searchDocs } from "../../src/sources/zenon/search.js";
import { resolveTarget } from "../../src/sources/zenon/siteApi.js";

describe("searchDocs (live)", () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it("finds results for a known term on the real site", async () => {
    const target = await resolveTarget("supervisor", undefined, "en");
    const results = await searchDocs(target, "alarm administration");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      title: expect.any(String),
      breadcrumb: expect.any(String),
      snippet: expect.any(String),
      url: expect.stringContaining("onlinehelp.copadata.com"),
    });
  }, 30_000);
});

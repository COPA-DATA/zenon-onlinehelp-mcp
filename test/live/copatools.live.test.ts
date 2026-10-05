// Opt-in live-site smoke test: hits the real, public docs-api-cd.copatools.com REST
// API directly (no browser, no auth needed). Not run by `npm test` (network-
// dependent). Run with `npm run test:live`.
import { describe, expect, it } from "vitest";
import { createCopatoolsDocSource } from "../../src/sources/copatools/index.js";

describe("copatools DocSource (live)", () => {
  it("finds results for a known term on the real API", async () => {
    const source = createCopatoolsDocSource();
    const { results } = await source.search("alarm", {});

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      title: expect.any(String),
      snippet: expect.any(String),
      url: expect.stringContaining("docs.copatools.com"),
    });
  }, 30_000);

  it("fetches and converts a real article to markdown", async () => {
    const source = createCopatoolsDocSource();
    const { results } = await source.search("alarm", {});
    const result = await source.fetch(results[0].url);

    expect(result.title.length).toBeGreaterThan(0);
    expect(result.markdown.length).toBeGreaterThan(0);
    expect(result.sourceUrl).toBe(results[0].url);
  }, 30_000);
});

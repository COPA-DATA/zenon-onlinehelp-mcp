// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

// Opt-in live-site smoke test, see search.live.test.ts for rationale. Run
// with `npm run test:live` after `npx playwright install chromium`.
import { afterAll, describe, expect, it } from "vitest";
import { closeBrowser } from "../../src/sources/zenon/browser.js";
import { fetchTopic } from "../../src/sources/zenon/fetchTopic.js";
import { searchDocs } from "../../src/sources/zenon/search.js";
import { resolveTarget } from "../../src/sources/zenon/siteApi.js";

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

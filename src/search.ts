import { Page } from "playwright";
import { withPage } from "./browser.js";
import { BASE_URL } from "./siteApi.js";
import { ResolvedTarget, SearchResult } from "./types.js";

const RESULTS_TIMEOUT_MS = 15_000;
const MAX_RESULTS = 10;
const MARK_SENTINEL = "@@ZDMCP_MARK@@";

interface RawSearchItem {
  documentId: string;
  header: string;
  path: string;
  body: string;
}

/**
 * Extracts structured data (documentId/header/path/body) for each rendered
 * "Pages" search result. The site doesn't expose this on the DOM directly
 * (no data-id/href), so we reach into the React fiber tree attached to each
 * result element to read the underlying `searchResultItem` the component
 * was rendered with — the same object the app's own click handler uses to
 * navigate.
 */
async function extractResults(page: Page): Promise<RawSearchItem[]> {
  return page.evaluate(
    ({ sentinel }) => {
      // header/body come back from the search index with <mark> tags around
      // matched terms and HTML-entity-encoded text (e.g. "&#228;" for "ä").
      // Decode via a scratch element (the browser's own parser) rather than
      // hand-rolling entity decoding, substituting a sentinel for the
      // <mark> boundaries first since they'd otherwise be stripped as
      // markup too.
      function decode(html: string, emphasize: boolean): string {
        const scratch = document.createElement("div");
        scratch.innerHTML = html.replace(/<\/?mark>/gi, sentinel);
        const text = scratch.textContent ?? "";
        return text
          .split(sentinel)
          .join(emphasize ? "**" : "")
          .replace(/\s+/g, " ")
          .trim();
      }

      const items = Array.from(document.querySelectorAll(".navigationPages > .searchResult"));
      const out: RawSearchItem[] = [];
      for (const item of items) {
        const fiberKey = Object.keys(item).find((k) => k.startsWith("__reactFiber"));
        if (!fiberKey) continue;
        let fiber: any = (item as any)[fiberKey];
        let sri: any = null;
        for (let i = 0; i < 8 && fiber && !sri; i++) {
          if (fiber.memoizedProps && fiber.memoizedProps.searchResultItem) {
            sri = fiber.memoizedProps.searchResultItem;
          }
          fiber = fiber.return;
        }
        if (sri && sri.documentId) {
          out.push({
            documentId: sri.documentId,
            header: decode(sri.header ?? "", false),
            path: sri.path ?? "",
            body: decode(sri.body ?? "", true),
          });
        }
      }
      return out;
    },
    { sentinel: MARK_SENTINEL }
  );
}

function permalink(target: ResolvedTarget, documentId: string): string {
  const params = new URLSearchParams({
    product: target.product,
    version: target.version,
    lang: target.lang,
    id: documentId,
  });
  return `${BASE_URL}/Content.html?${params.toString()}`;
}

/**
 * The results panel populates asynchronously with no clean DOM-mutation
 * signal to hook (a genuine zero-match query renders `.navigationPages` as
 * an empty, childless div — there's no separate "no results" marker to
 * wait for). Poll the rendered result count until it stops changing for a
 * couple of consecutive checks, which reliably distinguishes "done
 * rendering" from "still populating" for both empty and non-empty cases.
 */
async function waitForStableResultCount(page: Page): Promise<void> {
  const deadline = Date.now() + RESULTS_TIMEOUT_MS;
  let lastCount = -1;
  let stableChecks = 0;
  while (Date.now() < deadline) {
    const count = await page.locator(".navigationPages > .searchResult").count();
    if (count === lastCount) {
      stableChecks++;
      if (stableChecks >= 2) return;
    } else {
      stableChecks = 0;
      lastCount = count;
    }
    await page.waitForTimeout(250);
  }
}

export async function searchDocs(target: ResolvedTarget, query: string): Promise<SearchResult[]> {
  return withPage(target, async (page) => {
    // Scope to .headerBar: once the results panel is open (e.g. reusing an
    // already-searched page), the site renders a second, mirrored search
    // input/button inside the panel itself that must not be used here.
    const searchInput = page.locator('.headerBar input[placeholder="Search" i]');
    await searchInput.fill(query);
    // The query is only actually submitted on Enter; clicking the search
    // button alone just (re-)opens the panel showing whatever was last submitted.
    await searchInput.press("Enter");
    await page.waitForTimeout(300);
    await page.locator(".headerBar button.searchButton").click();

    await page
      .waitForSelector(".navigationContent .navigationPages", { timeout: RESULTS_TIMEOUT_MS })
      .catch(() => {
        throw new Error(`Timed out waiting for the search results panel for query "${query}".`);
      });
    await waitForStableResultCount(page);

    const raw = await extractResults(page);
    return raw.slice(0, MAX_RESULTS).map(
      (item): SearchResult => ({
        title: item.header,
        breadcrumb: item.path,
        snippet: item.body,
        url: permalink(target, item.documentId),
      })
    );
  });
}

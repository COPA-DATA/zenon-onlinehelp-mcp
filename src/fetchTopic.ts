import { Page } from "playwright";
import { withPage } from "./browser.js";
import { htmlToMarkdown } from "./markdown.js";
import { BASE_URL, resolveTarget } from "./siteApi.js";
import { FetchResult } from "./types.js";

const CONTENT_TIMEOUT_MS = 20_000;
const SETTLE_DELAY_MS = 300;

interface ParsedPermalink {
  product?: string;
  version?: string;
  lang?: string;
  id: string;
}

// Observed document id shapes: plain numeric ("315662"), a long hex content
// hash ("3546CAAC...B7DE"), or a "c_"-prefixed hex id (com/addin products).
// The site silently falls back to its start page for an id it can't
// resolve rather than erroring, so this shape check is the only cheap way
// to catch an obviously wrong id (e.g. a typo) before that happens.
const ID_PATTERN = /^(\d+|[0-9a-fA-F]{16,}|c_[0-9a-fA-F]+)$/;

export function parsePermalink(url: string): ParsedPermalink {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`"${url}" is not a valid URL.`);
  }
  if (parsed.hostname !== "onlinehelp.copadata.com" || !parsed.pathname.endsWith("Content.html")) {
    throw new Error(
      `"${url}" doesn't look like a zenon Online Help topic URL (expected a ${BASE_URL}/Content.html?... link, e.g. one returned by zenon_docs_search).`
    );
  }
  const id = parsed.searchParams.get("id");
  if (!id) {
    throw new Error(`"${url}" is missing the required "id" query parameter.`);
  }
  if (!ID_PATTERN.test(id)) {
    throw new Error(
      `"${id}" doesn't look like a valid zenon Online Help document id. Use a url returned by zenon_docs_search.`
    );
  }
  return {
    product: parsed.searchParams.get("product") ?? undefined,
    version: parsed.searchParams.get("version") ?? undefined,
    lang: parsed.searchParams.get("lang") ?? undefined,
    id,
  };
}

interface ExtractedTopic {
  title: string;
  breadcrumb: string;
  html: string;
}

/**
 * Topic rows are virtualized, so after navigating to a permalink several
 * neighboring topics can be present in the DOM at once. The app scrolls the
 * requested topic to just below the sticky header, so it's identified as
 * the rendered `.topic` element with the smallest non-negative distance
 * from the top of the viewport.
 */
async function extractActiveTopic(page: Page): Promise<ExtractedTopic | null> {
  return page.evaluate(() => {
    const topics = Array.from(document.querySelectorAll<HTMLElement>(".topic"));
    if (topics.length === 0) return null;

    let best: HTMLElement | null = null;
    let bestTop = Infinity;
    for (const topic of topics) {
      const top = topic.getBoundingClientRect().top;
      const distance = top >= 0 ? top : Math.abs(top) + 100000; // strongly prefer on/below-screen tops
      if (distance < bestTop) {
        bestTop = distance;
        best = topic;
      }
    }
    if (!best) return null;

    const heading = best.querySelector("x-heading, h1, h2, h3");
    const content = best.querySelector(".content");
    if (!content) return null;

    const selected = document.querySelector(".tocItem.selected");
    let breadcrumb = "";
    if (selected) {
      const crumbs: string[] = [];
      let li: HTMLElement | null = selected.closest("li");
      while (li) {
        const label = li.querySelector(":scope > div, :scope > span, :scope > a");
        crumbs.unshift((label ?? li).textContent?.trim() ?? "");
        li = li.parentElement ? li.parentElement.closest("li") : null;
      }
      breadcrumb = crumbs.filter(Boolean).join(" > ");
    }

    return {
      title: heading?.textContent?.trim() ?? "",
      breadcrumb,
      html: content.innerHTML,
    };
  });
}

export async function fetchTopic(url: string): Promise<FetchResult> {
  const parsed = parsePermalink(url);
  const target = await resolveTarget(parsed.product, parsed.version, parsed.lang);

  return withPage(target, async (page, gotoTopic) => {
    await gotoTopic(parsed.id);
    await page
      .waitForSelector("x-heading, .topic .content", { timeout: CONTENT_TIMEOUT_MS })
      .catch(() => {
        throw new Error(`Timed out loading topic content for ${url}.`);
      });
    await page.waitForTimeout(SETTLE_DELAY_MS);

    const extracted = await extractActiveTopic(page);
    if (!extracted) {
      throw new Error(`Could not find topic content for ${url}. It may not exist for this product/version/lang.`);
    }

    return {
      title: extracted.title,
      breadcrumb: extracted.breadcrumb,
      markdown: htmlToMarkdown(extracted.html, target),
      sourceUrl: url,
    };
  });
}

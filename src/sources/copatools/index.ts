// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { z } from "zod";
import type { DocSource } from "../../docSource.js";
import { resolveTarget } from "./resolveTarget.js";
import { getArticle, search as searchApi } from "./api.js";
import { htmlToMarkdown } from "./markdown.js";
import { ResolvedTarget } from "./types.js";
import { SearchResult, FetchResult } from "../../types.js";

const DOCS_HOST = "docs.copatools.com";

function permalink(target: ResolvedTarget, articleId: string): string {
  const params = new URLSearchParams({
    product: target.product,
    ver: target.version,
    lang: target.lang,
    articleId,
  });
  return `https://${DOCS_HOST}/?${params.toString()}`;
}

interface ParsedPermalink {
  product?: string;
  version?: string;
  lang?: string;
  articleId: string;
}

function parsePermalink(url: string): ParsedPermalink {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`"${url}" is not a valid URL.`);
  }
  if (parsed.hostname !== DOCS_HOST) {
    throw new Error(
      `"${url}" doesn't look like a docs.copatools.com article URL (expected a https://${DOCS_HOST}/?...articleId=... link, e.g. one returned by zenon_docs_search).`
    );
  }
  const articleId = parsed.searchParams.get("articleId");
  if (!articleId) {
    throw new Error(`"${url}" is missing the required "articleId" query parameter.`);
  }
  return {
    product: parsed.searchParams.get("product") ?? undefined,
    version: parsed.searchParams.get("ver") ?? undefined,
    lang: parsed.searchParams.get("lang") ?? undefined,
    articleId,
  };
}

export function createCopatoolsDocSource(): DocSource {
  return {
    id: "copatools",
    tools: {
      searchTool: {
        title: "Search docs.copatools.com",
        description:
          "Search the docs.copatools.com \"COPA-DATA Docs\" documentation portal (the same underlying zenon " +
          "documentation, served through a different site) and return up to 10 concise results (title, snippet, " +
          "and a permalink URL). Use this first to find relevant topics, then pass a result's url to " +
          "zenon_docs_fetch to read its full content.",
      },
      fetchTool: {
        title: "Fetch a docs.copatools.com article",
        description:
          "Fetch the full content of a single docs.copatools.com article as markdown, given a permalink url " +
          `(as returned by zenon_docs_search, in the form https://${DOCS_HOST}/?product=...&ver=...&lang=...&articleId=...).`,
        urlParamDescription: "A docs.copatools.com article permalink, typically copied from a zenon_docs_search result.",
      },
    },
    searchParamsSchema: {
      product: z
        .enum(["supervisor", "com", "addin"])
        .optional()
        .describe(
          '"supervisor" = main zenon manual (default), "com" = COM API documentation, "addin" = Add-In API documentation.'
        ),
      version: z
        .string()
        .optional()
        .describe('Documentation version, e.g. "1600" for zenon 16. Defaults to the newest available public version.'),
      lang: z.string().optional().describe('Language code, e.g. "en" (default) or "de".'),
    },
    async search(query, extra) {
      const target = await resolveTarget(
        extra.product as string | undefined,
        extra.version as string | undefined,
        extra.lang as string | undefined
      );
      const hits = await searchApi(query, target.product, target.version, target.lang);
      const results: SearchResult[] = hits.slice(0, 10).map((hit) => ({
        title: hit.title,
        breadcrumb: "",
        snippet: hit.body,
        url: permalink(target, hit._id),
      }));
      return { results, emptyResultContext: `in ${target.product} v${target.version}` };
    },
    async fetch(url) {
      const parsed = parsePermalink(url);
      const target = await resolveTarget(parsed.product, parsed.version, parsed.lang);
      const article = await getArticle(parsed.articleId, target.product, target.version, target.lang);
      const result: FetchResult = {
        title: article.title,
        breadcrumb: "",
        markdown: htmlToMarkdown(article.body),
        sourceUrl: url,
      };
      return result;
    },
    async close() {
      // Pure REST client — no held resources (no browser, no persistent connections).
    },
  };
}

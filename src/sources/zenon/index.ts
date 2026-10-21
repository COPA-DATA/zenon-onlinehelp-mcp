// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { z } from "zod";
import type { DocSource } from "../../docSource.js";
import { resolveTarget } from "./siteApi.js";
import { searchDocs } from "./search.js";
import { fetchTopic } from "./fetchTopic.js";
import { closeBrowser } from "./browser.js";
import { Product } from "./types.js";

export function createZenonDocSource(): DocSource {
  return {
    id: "zenon",
    tools: {
      searchTool: {
        title: "Search zenon Online Help",
        description:
          "Search the official zenon user documentation (onlinehelp.copadata.com) and return up to 10 concise results " +
          "(title, breadcrumb path, snippet, and a permalink URL). Use this first to find relevant topics, then pass a " +
          "result's url to zenon_docs_fetch to read its full content.",
      },
      fetchTool: {
        title: "Fetch a zenon Online Help topic",
        description:
          "Fetch the full content of a single zenon Online Help topic as markdown, given a permalink url " +
          "(as returned by zenon_docs_search, in the form https://onlinehelp.copadata.com/Content.html?product=...&version=...&lang=...&id=...).",
        urlParamDescription: "A zenon Online Help topic permalink, typically copied from a zenon_docs_search result.",
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
        .describe('Documentation version, e.g. "1600" for zenon 16. Defaults to the newest available version.'),
      lang: z.string().optional().describe('Language code, e.g. "en" (default) or "de".'),
    },
    async search(query, extra) {
      const target = await resolveTarget(
        extra.product as Product | undefined,
        extra.version as string | undefined,
        extra.lang as string | undefined
      );
      const results = await searchDocs(target, query);
      return { results, emptyResultContext: `in ${target.product} v${target.version}` };
    },
    async fetch(url) {
      return fetchTopic(url);
    },
    async close() {
      await closeBrowser();
    },
  };
}

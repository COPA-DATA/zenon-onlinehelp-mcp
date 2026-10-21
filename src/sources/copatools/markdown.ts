// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import TurndownService from "turndown";

function createTurndown(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Article bodies ship the same custom MadCap-style elements as the zenon
  // source (e.g. <x-heading>); treat any unknown "x-*" tag as an inline
  // pass-through so its text isn't dropped.
  turndown.addRule("customElements", {
    filter: (node) => node.nodeName.toLowerCase().startsWith("x-"),
    replacement: (content) => content,
  });

  // Images are served as relative paths (e.g. "images/123.png"). Unlike the
  // zenon source, the real absolute image URL for this API is not confirmed
  // (direct path guesses against api.copatools.com 404'd; the article
  // response's `resources` field is the likely real mechanism and needs
  // confirming against a real article that has images). Rather than emit a
  // guessed, likely-broken absolute URL, leave relative/unresolved src as-is
  // so conversion never fails outright over this — only genuinely absolute
  // or data URLs pass through unchanged as expected.
  turndown.addRule("images", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      const alt = el.getAttribute("alt") ?? "";
      const src = el.getAttribute("src") ?? "";
      if (!src) return alt ? `*[image: ${alt}]*` : "";
      return `![${alt}](${src})`;
    },
  });

  // Glossary/popover cross-references (e.g. <a data-itemtoggle="popover"
  // data-itemid="...">term</a>) are inline tooltips, not links to another
  // page, and their data-itemid is a topic_id that would need a full TOC
  // walk to resolve to a fetchable article id anyway. Render as plain text
  // rather than emit a broken link.
  turndown.addRule("popoverReferences", {
    filter: (node) => node.nodeName === "A" && node.getAttribute("data-itemtoggle") === "popover",
    replacement: (content) => content,
  });

  return turndown;
}

export function htmlToMarkdown(html: string): string {
  return createTurndown().turndown(html).trim();
}

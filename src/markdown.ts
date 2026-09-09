import TurndownService from "turndown";
import { BASE_URL } from "./siteApi.js";
import { ResolvedTarget } from "./types.js";

function createTurndown(target: ResolvedTarget): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Topic content ships custom MadCap-style elements (e.g. <x-heading>); treat
  // any unknown "x-*" tag as an inline pass-through so its text isn't dropped.
  turndown.addRule("customElements", {
    filter: (node) => node.nodeName.toLowerCase().startsWith("x-"),
    replacement: (content) => content,
  });

  // Images are served relative to the topic (e.g. "images/123.png"); resolve
  // those against the site's image endpoint so links work outside the
  // browser session. Absolute/data URLs are left untouched; ephemeral
  // blob: URLs (unusable outside this session) fall back to alt text only.
  turndown.addRule("resolvedImages", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      const alt = el.getAttribute("alt") ?? "";
      const src = el.getAttribute("src") ?? "";
      if (!src || src.startsWith("blob:")) return alt ? `*[image: ${alt}]*` : "";
      const resolved = /^(https?:|data:)/i.test(src)
        ? src
        : `${BASE_URL}/api/v2/web/${target.product}/${target.version}/${target.lang}/${src.replace(/^\/+/, "")}`;
      return `![${alt}](${resolved})`;
    },
  });

  // Cross-references to other topics use an internal "#showid/<documentId>"
  // client-side-router anchor, meaningless outside the SPA. Rewrite them to
  // real permalinks (the same scheme zenon_docs_search returns) so links in
  // fetched markdown are actually usable.
  turndown.addRule("resolvedCrossReferences", {
    filter: (node) => node.nodeName === "A" && !!node.getAttribute("href")?.startsWith("#showid/"),
    replacement: (content, node) => {
      const href = (node as HTMLAnchorElement).getAttribute("href") ?? "";
      const id = href.slice("#showid/".length);
      const params = new URLSearchParams({
        product: target.product,
        version: target.version,
        lang: target.lang,
        id,
      });
      return `[${content}](${BASE_URL}/Content.html?${params.toString()})`;
    },
  });

  return turndown;
}

export function htmlToMarkdown(html: string, target: ResolvedTarget): string {
  return createTurndown(target).turndown(html).trim();
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../../src/sources/zenon/markdown.js";
import { BASE_URL } from "../../src/sources/zenon/siteApi.js";
import { ResolvedTarget } from "../../src/sources/zenon/types.js";

const target: ResolvedTarget = { product: "supervisor", version: "1600", lang: "en" };

describe("htmlToMarkdown", () => {
  it("converts plain HTML to markdown", () => {
    const html = "<h1>Title</h1><p>Some <strong>text</strong>.</p><ul><li>One</li><li>Two</li></ul>";
    const md = htmlToMarkdown(html, target);
    expect(md).toContain("# Title");
    expect(md).toContain("**text**");
    expect(md).toContain("*   One");
    expect(md).toContain("*   Two");
  });

  it("renders fenced code blocks", () => {
    const html = "<pre><code>const x = 1;</code></pre>";
    const md = htmlToMarkdown(html, target);
    expect(md).toContain("```");
    expect(md).toContain("const x = 1;");
  });

  it("passes through text content of unknown x-* custom elements", () => {
    const html = "<x-heading>Custom Heading Text</x-heading>";
    const md = htmlToMarkdown(html, target);
    expect(md).toBe("Custom Heading Text");
    expect(md).not.toContain("<x-heading>");
  });

  it("resolves a relative image src against the site's image endpoint", () => {
    const html = '<img src="images/123.png" alt="A diagram">';
    const md = htmlToMarkdown(html, target);
    expect(md).toBe(
      `![A diagram](${BASE_URL}/api/v2/web/supervisor/1600/en/images/123.png)`
    );
  });

  it("strips a leading slash from a relative image src before resolving", () => {
    const html = '<img src="/images/123.png" alt="A diagram">';
    const md = htmlToMarkdown(html, target);
    expect(md).toBe(
      `![A diagram](${BASE_URL}/api/v2/web/supervisor/1600/en/images/123.png)`
    );
  });

  it("leaves an absolute http(s) image src untouched", () => {
    const html = '<img src="https://example.com/pic.png" alt="External">';
    const md = htmlToMarkdown(html, target);
    expect(md).toBe("![External](https://example.com/pic.png)");
  });

  it("leaves a data: image src untouched", () => {
    const html = '<img src="data:image/png;base64,AAAA" alt="Inline">';
    const md = htmlToMarkdown(html, target);
    expect(md).toBe("![Inline](data:image/png;base64,AAAA)");
  });

  it("degrades a blob: image src with alt text to an italic placeholder", () => {
    const html = '<img src="blob:https://onlinehelp.copadata.com/abc-123" alt="Screenshot">';
    const md = htmlToMarkdown(html, target);
    expect(md).toBe("*[image: Screenshot]*");
  });

  it("degrades a blob: image src without alt text to an empty string", () => {
    const html = '<img src="blob:https://onlinehelp.copadata.com/abc-123">';
    const md = htmlToMarkdown(html, target);
    expect(md).toBe("");
  });

  it("rewrites a #showid/ cross-reference to a real permalink", () => {
    const html = '<a href="#showid/315662">Related topic</a>';
    const md = htmlToMarkdown(html, target);
    expect(md).toBe(
      `[Related topic](${BASE_URL}/Content.html?product=supervisor&version=1600&lang=en&id=315662)`
    );
  });

  it("leaves a normal (non #showid/) link as a standard markdown link", () => {
    const html = '<a href="https://example.com/page">External link</a>';
    const md = htmlToMarkdown(html, target);
    expect(md).toBe("[External link](https://example.com/page)");
  });

  it("handles a custom element containing an image and a cross-reference together", () => {
    const html =
      '<x-heading>See <img src="images/x.png" alt="icon"> and <a href="#showid/999">this topic</a></x-heading>';
    const md = htmlToMarkdown(html, target);
    expect(md).toContain(`![icon](${BASE_URL}/api/v2/web/supervisor/1600/en/images/x.png)`);
    expect(md).toContain(`[this topic](${BASE_URL}/Content.html?product=supervisor&version=1600&lang=en&id=999)`);
    expect(md).not.toContain("<x-heading>");
  });
});

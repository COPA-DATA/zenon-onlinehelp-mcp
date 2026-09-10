import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../../../src/sources/copatools/markdown.js";

describe("copatools htmlToMarkdown", () => {
  it("converts plain HTML to markdown", () => {
    const html = "<h1>Title</h1><p>Some <strong>text</strong>.</p><ul><li>One</li><li>Two</li></ul>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("# Title");
    expect(md).toContain("**text**");
    expect(md).toContain("*   One");
    expect(md).toContain("*   Two");
  });

  it("passes through text content of unknown x-* custom elements", () => {
    const html = "<x-heading>Custom Heading Text</x-heading>";
    const md = htmlToMarkdown(html);
    expect(md).toBe("Custom Heading Text");
    expect(md).not.toContain("<x-heading>");
  });

  it("leaves a relative image src unresolved rather than guessing a broken absolute URL", () => {
    const html = '<img src="images/123.png" alt="A diagram">';
    const md = htmlToMarkdown(html);
    expect(md).toBe("![A diagram](images/123.png)");
  });

  it("leaves an absolute http(s) image src untouched", () => {
    const html = '<img src="https://example.com/pic.png" alt="External">';
    const md = htmlToMarkdown(html);
    expect(md).toBe("![External](https://example.com/pic.png)");
  });

  it("renders a glossary/popover cross-reference as plain text, not a broken link", () => {
    const html =
      '<span class="popuponclicktemplate "><a data-itemtoggle="popover" id="d1e460149" ' +
      'data-itemid="D7AF214D99017FF48CFE84EF181770153DC076F9F7BA9BC59A27856E1AB39E18" title="ID_PROJEKT_AML">' +
      '<span class="property">Alarmmeldeliste</span></a></span>';
    const md = htmlToMarkdown(html);
    expect(md).toBe("Alarmmeldeliste");
    expect(md).not.toContain("[Alarmmeldeliste]");
  });

  it("leaves a normal external link as a standard markdown link", () => {
    const html = '<a href="https://selfservice.copadata.com/">Self Service Portal</a>';
    const md = htmlToMarkdown(html);
    expect(md).toBe("[Self Service Portal](https://selfservice.copadata.com/)");
  });

  // Real article body captured live from GET /article/359875 (the
  // "Copyright" article), confirming the actual x-heading/bodytext/image
  // conventions this converter needs to handle.
  it("converts a real captured article body", () => {
    const html =
      '<div id="4B26136B76E6BFDE7DCA16E16706EA4BB4C3494DB75C2FEB76B4471E355E1961" data-aitid="359875" ' +
      'data-aitvariantparent="-1" class="0_generaltemplate "><x-heading>Copyright</x-heading>' +
      '<p class="bodytext"><img src="images/23262.png" class="oem_graphics_fixed "></p>' +
      '<p class="bodytext">© 2026 Ing. Punzenberger COPA-DATA GmbH</p>' +
      '<p class="bodytext">Alle Rechte vorbehalten.</p></div>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("Copyright");
    expect(md).toContain("![](images/23262.png)");
    expect(md).toContain("© 2026 Ing. Punzenberger COPA-DATA GmbH");
    expect(md).toContain("Alle Rechte vorbehalten.");
  });
});

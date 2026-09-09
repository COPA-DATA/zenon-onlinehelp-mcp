import { describe, expect, it } from "vitest";
import { parsePermalink } from "../../src/fetchTopic.js";

const BASE = "https://onlinehelp.copadata.com/Content.html";

describe("parsePermalink", () => {
  it("parses a full permalink with all query params", () => {
    const result = parsePermalink(`${BASE}?product=supervisor&version=1600&lang=en&id=315662`);
    expect(result).toEqual({ product: "supervisor", version: "1600", lang: "en", id: "315662" });
  });

  it("parses a minimal permalink with only an id", () => {
    const result = parsePermalink(`${BASE}?id=315662`);
    expect(result).toEqual({ product: undefined, version: undefined, lang: undefined, id: "315662" });
  });

  it.each([
    ["plain numeric id", "315662"],
    ["long hex content-hash id", "3546CAACB7DE1234"],
    ["c_-prefixed hex id", "c_1a2b3c"],
  ])("accepts a %s", (_label, id) => {
    const result = parsePermalink(`${BASE}?id=${id}`);
    expect(result.id).toBe(id);
  });

  it("throws for a string that isn't a valid URL", () => {
    expect(() => parsePermalink("not a url")).toThrow(/is not a valid URL/);
  });

  it("throws for a URL on the wrong host", () => {
    expect(() => parsePermalink("https://example.com/Content.html?id=315662")).toThrow(
      /doesn't look like a zenon Online Help topic URL/
    );
  });

  it("throws for a URL whose path doesn't end with Content.html", () => {
    expect(() => parsePermalink("https://onlinehelp.copadata.com/Other.html?id=315662")).toThrow(
      /doesn't look like a zenon Online Help topic URL/
    );
  });

  it("throws when the id query parameter is missing", () => {
    expect(() => parsePermalink(`${BASE}?product=supervisor`)).toThrow(/missing the required "id"/);
  });

  it.each([
    ["non-hex short string", "abc"],
    ["too-short hex-looking string", "a1b2c3"],
    ["c_ prefix with no hex suffix", "c_"],
  ])("throws for a malformed id (%s)", (_label, id) => {
    expect(() => parsePermalink(`${BASE}?id=${id}`)).toThrow(
      /doesn't look like a valid zenon Online Help document id/
    );
  });
});

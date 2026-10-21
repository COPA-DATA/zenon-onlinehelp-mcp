// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVersions, getToc, getArticle, search } from "../../../src/sources/copatools/api.js";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe("copatools api", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.COPATOOLS_API_BASE_URL;
  });

  it("getVersions fetches /admin/versions", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse([{ code: "1600" }]));
    vi.stubGlobal("fetch", mockFetch);

    const versions = await getVersions();

    expect(versions).toEqual([{ code: "1600" }]);
    expect(mockFetch).toHaveBeenCalledWith("https://docs-api-cd.copatools.com/admin/versions");
  });

  it("getToc fetches /toc with product/ver/lang query params", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    await getToc("supervisor", "1600", "en");

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toBe("/toc");
    expect(calledUrl.searchParams.get("product")).toBe("supervisor");
    expect(calledUrl.searchParams.get("ver")).toBe("1600");
    expect(calledUrl.searchParams.get("lang")).toBe("en");
  });

  it("getArticle fetches /article/{id} with query params, URL-encoding the id", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ _id: "1 2" }));
    vi.stubGlobal("fetch", mockFetch);

    await getArticle("1 2", "supervisor", "1600", "en");

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toBe("/article/1%202");
    expect(calledUrl.searchParams.get("product")).toBe("supervisor");
  });

  it("search fetches /search with q/product/ver/lang query params", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    await search("alarm", "supervisor", "1600", "en");

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toBe("/search");
    expect(calledUrl.searchParams.get("q")).toBe("alarm");
  });

  it("throws a descriptive error (including status and URL) on a non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({}, false, 503));
    vi.stubGlobal("fetch", mockFetch);

    await expect(getVersions()).rejects.toThrow(/admin\/versions.*status 503/s);
  });

  it("honors COPATOOLS_API_BASE_URL for the request host", async () => {
    process.env.COPATOOLS_API_BASE_URL = "https://staging-api.copatools.com";
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    await getVersions();

    expect(mockFetch).toHaveBeenCalledWith("https://staging-api.copatools.com/admin/versions");
  });
});

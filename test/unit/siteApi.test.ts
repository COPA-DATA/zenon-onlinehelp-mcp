import { beforeEach, describe, expect, it, vi } from "vitest";

// siteApi.ts caches the content manifest in module-level mutable state
// (`manifestCache`) with no exported reset hook. vi.resetModules() plus a
// fresh dynamic import per test gives each test its own module instance, so
// the cache from one test can't leak into the next.
async function freshSiteApi() {
  vi.resetModules();
  return import("../../src/sources/zenon/siteApi.js");
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe("siteApi", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getContentManifest", () => {
    it("fetches the manifest and sorts versions numerically descending", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ supervisor: ["1500", "1600", "800"], com: ["10"], addin: [] })
      );
      vi.stubGlobal("fetch", mockFetch);
      const siteApi = await freshSiteApi();

      const manifest = await siteApi.getContentManifest();

      expect(manifest.supervisor).toEqual(["1600", "1500", "800"]);
      expect(manifest.com).toEqual(["10"]);
      expect(mockFetch).toHaveBeenCalledWith(`${siteApi.BASE_URL}/api/v1/Content`);
    });

    it("excludes products with an empty or missing version list", async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ supervisor: ["1600"], com: [] }));
      vi.stubGlobal("fetch", mockFetch);
      const siteApi = await freshSiteApi();

      const manifest = await siteApi.getContentManifest();

      expect(manifest.com).toBeUndefined();
      expect(manifest.addin).toBeUndefined();
    });

    it("caches the manifest across calls within the TTL", async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ supervisor: ["1600"] }));
      vi.stubGlobal("fetch", mockFetch);
      const siteApi = await freshSiteApi();

      await siteApi.getContentManifest();
      await siteApi.getContentManifest();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws a descriptive error on a non-ok response", async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
      vi.stubGlobal("fetch", mockFetch);
      const siteApi = await freshSiteApi();

      await expect(siteApi.getContentManifest()).rejects.toThrow(/failed with status 500/);
    });
  });

  describe("getLanguages", () => {
    it("fetches the languages endpoint for the given product/version", async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(["en", "de"]));
      vi.stubGlobal("fetch", mockFetch);
      const siteApi = await freshSiteApi();

      const languages = await siteApi.getLanguages("supervisor", "1600");

      expect(languages).toEqual(["en", "de"]);
      expect(mockFetch).toHaveBeenCalledWith(`${siteApi.BASE_URL}/api/v1/languages/supervisor/1600`);
    });
  });

  describe("resolveTarget", () => {
    function stubManifestAndLanguages(
      manifest: Record<string, string[]>,
      languagesByKey: Record<string, string[]>
    ) {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith("/api/v1/Content")) return jsonResponse(manifest);
        const match = url.match(/\/api\/v1\/languages\/(.+)\/(.+)$/);
        const key = match ? `${match[1]}/${match[2]}` : "";
        return jsonResponse(languagesByKey[key] ?? []);
      });
      vi.stubGlobal("fetch", mockFetch);
    }

    it("defaults product to supervisor, version to newest, lang to en", async () => {
      stubManifestAndLanguages(
        { supervisor: ["1500", "1600"] },
        { "supervisor/1600": ["de", "en"] }
      );
      const siteApi = await freshSiteApi();

      const target = await siteApi.resolveTarget(undefined, undefined, undefined);

      expect(target).toEqual({ product: "supervisor", version: "1600", lang: "en" });
    });

    it("falls back to the first available language when en isn't offered", async () => {
      stubManifestAndLanguages(
        { supervisor: ["1600"] },
        { "supervisor/1600": ["de", "fr"] }
      );
      const siteApi = await freshSiteApi();

      const target = await siteApi.resolveTarget(undefined, undefined, undefined);

      expect(target.lang).toBe("de");
    });

    it("honors explicit product/version/lang when all are valid", async () => {
      stubManifestAndLanguages(
        { supervisor: ["1500", "1600"], com: ["10"] },
        { "com/10": ["en", "de"] }
      );
      const siteApi = await freshSiteApi();

      const target = await siteApi.resolveTarget("com", "10", "de");

      expect(target).toEqual({ product: "com", version: "10", lang: "de" });
    });

    it("throws for an unknown product", async () => {
      stubManifestAndLanguages({ supervisor: ["1600"] }, {});
      const siteApi = await freshSiteApi();

      await expect(siteApi.resolveTarget("bogus", undefined, undefined)).rejects.toThrow(
        /Unknown or unavailable product "bogus"/
      );
    });

    it("throws for an unknown version", async () => {
      stubManifestAndLanguages({ supervisor: ["1600"] }, {});
      const siteApi = await freshSiteApi();

      await expect(siteApi.resolveTarget("supervisor", "999", undefined)).rejects.toThrow(
        /Unknown version "999"/
      );
    });

    it("throws for an unknown language", async () => {
      stubManifestAndLanguages({ supervisor: ["1600"] }, { "supervisor/1600": ["en"] });
      const siteApi = await freshSiteApi();

      await expect(siteApi.resolveTarget("supervisor", "1600", "zz")).rejects.toThrow(
        /Unknown language "zz"/
      );
    });
  });
});

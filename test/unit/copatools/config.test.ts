import { afterEach, describe, expect, it } from "vitest";
import { getCopatoolsConfig } from "../../../src/sources/copatools/config.js";

const ORIGINAL = process.env.COPATOOLS_API_BASE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.COPATOOLS_API_BASE_URL;
  } else {
    process.env.COPATOOLS_API_BASE_URL = ORIGINAL;
  }
});

describe("getCopatoolsConfig", () => {
  it("defaults apiBaseUrl to https://api.copatools.com", () => {
    delete process.env.COPATOOLS_API_BASE_URL;
    expect(getCopatoolsConfig().apiBaseUrl).toBe("https://api.copatools.com");
  });

  it("honors an env override", () => {
    process.env.COPATOOLS_API_BASE_URL = "https://staging-api.copatools.com";
    expect(getCopatoolsConfig().apiBaseUrl).toBe("https://staging-api.copatools.com");
  });

  it("strips a trailing slash", () => {
    process.env.COPATOOLS_API_BASE_URL = "https://staging-api.copatools.com/";
    expect(getCopatoolsConfig().apiBaseUrl).toBe("https://staging-api.copatools.com");
  });
});

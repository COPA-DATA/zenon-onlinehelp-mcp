// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionInfo } from "../../../src/sources/copatools/types.js";

vi.mock("../../../src/sources/copatools/api.js", () => ({ getVersions: vi.fn() }));

import { resolveTarget } from "../../../src/sources/copatools/resolveTarget.js";
import { getVersions } from "../../../src/sources/copatools/api.js";

const getVersionsMock = vi.mocked(getVersions);

// Modeled on the real, live-confirmed /admin/versions response shape.
const FIXTURE: VersionInfo[] = [
  {
    _id: "1",
    code: "1700",
    displayName: "zenon 17",
    languages: ["en", "de"],
    oem: "copadata",
    products: ["supervisor"],
    public: false,
  },
  {
    _id: "2",
    code: "1600",
    displayName: "zenon 16",
    languages: ["en", "de"],
    oem: "copadata",
    products: ["supervisor", "addin", "com"],
    public: true,
  },
  {
    _id: "3",
    code: "1500",
    displayName: "zenon 15",
    languages: ["de", "fr"],
    oem: "copadata",
    products: ["supervisor", "addin", "com"],
    public: true,
  },
  {
    _id: "4",
    code: "9999",
    displayName: "other oem",
    languages: ["en"],
    oem: "someoneelse",
    products: ["supervisor"],
    public: true,
  },
];

describe("copatools resolveTarget", () => {
  beforeEach(() => {
    getVersionsMock.mockReset();
    getVersionsMock.mockResolvedValue(FIXTURE);
  });

  it("defaults product to supervisor, version to newest public copadata version, lang to en", async () => {
    const target = await resolveTarget(undefined, undefined, undefined);
    expect(target).toEqual({ product: "supervisor", version: "1600", lang: "en" });
  });

  it("excludes non-public versions from the default selection", async () => {
    const target = await resolveTarget(undefined, undefined, undefined);
    expect(target.version).not.toBe("1700");
  });

  it("excludes other-OEM versions from the default selection", async () => {
    const target = await resolveTarget(undefined, undefined, undefined);
    expect(target.version).not.toBe("9999");
  });

  it("falls back to the first available language when en isn't offered", async () => {
    const target = await resolveTarget(undefined, "1500", undefined);
    expect(target.lang).toBe("de");
  });

  it("honors explicit product/version/lang when all are valid", async () => {
    const target = await resolveTarget("com", "1500", "fr");
    expect(target).toEqual({ product: "com", version: "1500", lang: "fr" });
  });

  it("throws for an unknown product", async () => {
    await expect(resolveTarget("bogus", undefined, undefined)).rejects.toThrow(
      /Unknown or unavailable product "bogus"/
    );
  });

  it("throws for a non-public version (not a valid resolvable target)", async () => {
    await expect(resolveTarget("supervisor", "1700", undefined)).rejects.toThrow(/Unknown version "1700"/);
  });

  it("throws for an unknown language", async () => {
    await expect(resolveTarget("supervisor", "1600", "zz")).rejects.toThrow(/Unknown language "zz"/);
  });
});

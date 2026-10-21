// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { afterEach, describe, expect, it } from "vitest";
import { getActiveDocSource } from "../../src/sourceConfig.js";

const ORIGINAL_DOC_SOURCE = process.env.DOC_SOURCE;

afterEach(() => {
  if (ORIGINAL_DOC_SOURCE === undefined) {
    delete process.env.DOC_SOURCE;
  } else {
    process.env.DOC_SOURCE = ORIGINAL_DOC_SOURCE;
  }
});

describe("getActiveDocSource", () => {
  it("defaults to the zenon source when DOC_SOURCE is unset", () => {
    delete process.env.DOC_SOURCE;
    expect(getActiveDocSource().id).toBe("zenon");
  });

  it("selects the zenon source explicitly", () => {
    process.env.DOC_SOURCE = "zenon";
    expect(getActiveDocSource().id).toBe("zenon");
  });

  it("selects the copatools source", () => {
    process.env.DOC_SOURCE = "copatools";
    expect(getActiveDocSource().id).toBe("copatools");
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.DOC_SOURCE = "  CopaTools  ";
    expect(getActiveDocSource().id).toBe("copatools");
  });

  it("throws a descriptive error for an unknown value", () => {
    process.env.DOC_SOURCE = "bogus";
    expect(() => getActiveDocSource()).toThrow(/Unknown DOC_SOURCE "bogus"/);
  });
});

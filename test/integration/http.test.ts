// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Response as SupertestResponse } from "supertest";

// Same dependency-mocking approach as mcpServer.test.ts: exercise the HTTP
// transport wiring without any real network or browser I/O.
vi.mock("../../src/sources/zenon/siteApi.js", () => ({ resolveTarget: vi.fn() }));
vi.mock("../../src/sources/zenon/search.js", () => ({ searchDocs: vi.fn() }));
vi.mock("../../src/sources/zenon/fetchTopic.js", () => ({ fetchTopic: vi.fn() }));

import { createHttpApp } from "../../src/httpApp.js";
import { resolveTarget } from "../../src/sources/zenon/siteApi.js";
import { searchDocs } from "../../src/sources/zenon/search.js";
import { fetchTopic } from "../../src/sources/zenon/fetchTopic.js";

const resolveTargetMock = vi.mocked(resolveTarget);
const searchDocsMock = vi.mocked(searchDocs);
const fetchTopicMock = vi.mocked(fetchTopic);

const JSON_RPC_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

// The Streamable HTTP transport may answer either as a plain JSON body or
// as a single-event SSE stream, depending on negotiation; handle both so
// the test asserts on the JSON-RPC payload itself, not the wire framing.
function parseJsonRpcBody(res: SupertestResponse): any {
  const contentType = String(res.headers["content-type"] ?? "");
  if (contentType.includes("text/event-stream")) {
    const dataLine = res.text.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) throw new Error(`No SSE "data:" line found in response body: ${res.text}`);
    return JSON.parse(dataLine.slice("data:".length).trim());
  }
  return JSON.parse(res.text);
}

describe("HTTP /mcp", () => {
  beforeEach(() => {
    resolveTargetMock.mockReset();
    searchDocsMock.mockReset();
    fetchTopicMock.mockReset();
  });

  it("returns 405 with a JSON-RPC -32000 error body for GET /mcp", async () => {
    const app = createHttpApp();
    const res = await request(app).get("/mcp");

    expect(res.status).toBe(405);
    expect(JSON.parse(res.text)).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  it("returns 405 with a JSON-RPC -32000 error body for DELETE /mcp", async () => {
    const app = createHttpApp();
    const res = await request(app).delete("/mcp");

    expect(res.status).toBe(405);
    expect(JSON.parse(res.text)).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  describe("POST /mcp", () => {
    it("handles a tools/call request for zenon_docs_search", async () => {
      resolveTargetMock.mockResolvedValue({ product: "supervisor", version: "1600", lang: "en" });
      searchDocsMock.mockResolvedValue([
        {
          title: "Alarm administration",
          breadcrumb: "Data recording > Alarm Administration",
          snippet: "...",
          url: "https://onlinehelp.copadata.com/Content.html?id=1",
        },
      ]);
      const app = createHttpApp();

      const res = await request(app)
        .post("/mcp")
        .set(JSON_RPC_HEADERS)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "zenon_docs_search", arguments: { query: "alarm" } },
        });

      expect(res.status).toBe(200);
      const body = parseJsonRpcBody(res);
      expect(body.error).toBeUndefined();
      const content = body.result.content as Array<{ type: string; text?: string }>;
      const parsedResults = JSON.parse(content[0]?.text ?? "[]");
      expect(parsedResults[0].title).toBe("Alarm administration");
      expect(searchDocsMock).toHaveBeenCalledWith({ product: "supervisor", version: "1600", lang: "en" }, "alarm");
    });

    it("handles a tools/call request for zenon_docs_fetch", async () => {
      const url = "https://onlinehelp.copadata.com/Content.html?id=315662";
      fetchTopicMock.mockResolvedValue({
        title: "Alarm administration",
        breadcrumb: "Data recording > Alarm Administration",
        markdown: "Some **content**.",
        sourceUrl: url,
      });
      const app = createHttpApp();

      const res = await request(app)
        .post("/mcp")
        .set(JSON_RPC_HEADERS)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "zenon_docs_fetch", arguments: { url } },
        });

      expect(res.status).toBe(200);
      const body = parseJsonRpcBody(res);
      const content = body.result.content as Array<{ type: string; text?: string }>;
      expect(content[0]?.text).toBe(
        "# Alarm administration\n\nData recording > Alarm Administration\n\nSome **content**."
      );
    });

    it("surfaces a rejected dependency as a tool-level error, not an HTTP failure", async () => {
      // "bogus" is schema-valid (any string is a legal `version`), so this
      // exercises resolveTarget's own business-logic rejection rather than
      // zod input validation (an invalid `product` enum value, by contrast,
      // is rejected before the handler ever runs).
      resolveTargetMock.mockRejectedValue(new Error('Unknown version "bogus" for product "supervisor".'));
      const app = createHttpApp();

      const res = await request(app)
        .post("/mcp")
        .set(JSON_RPC_HEADERS)
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "zenon_docs_search", arguments: { query: "x", version: "bogus" } },
        });

      expect(res.status).toBe(200);
      const body = parseJsonRpcBody(res);
      expect(body.result.isError).toBe(true);
      const content = body.result.content as Array<{ type: string; text?: string }>;
      expect(content[0]?.text).toContain('Unknown version "bogus" for product "supervisor"');
    });
  });

  describe("Front Door lockdown (frontDoorId)", () => {
    const FRONT_DOOR_ID = "11111111-2222-3333-4444-555555555555";
    const TOOLS_LIST = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    const FORBIDDEN = { jsonrpc: "2.0", error: { code: -32000, message: "Forbidden." }, id: null };

    it("rejects requests without an X-Azure-FDID header with 403", async () => {
      const app = createHttpApp({ frontDoorId: FRONT_DOOR_ID });
      const res = await request(app).post("/mcp").set(JSON_RPC_HEADERS).send(TOOLS_LIST);

      expect(res.status).toBe(403);
      expect(JSON.parse(res.text)).toEqual(FORBIDDEN);
    });

    it("rejects requests with a different X-Azure-FDID with 403", async () => {
      const app = createHttpApp({ frontDoorId: FRONT_DOOR_ID });
      const res = await request(app)
        .post("/mcp")
        .set(JSON_RPC_HEADERS)
        .set("X-Azure-FDID", "00000000-0000-0000-0000-000000000000")
        .send(TOOLS_LIST);

      expect(res.status).toBe(403);
      expect(JSON.parse(res.text)).toEqual(FORBIDDEN);
    });

    it("serves requests carrying the matching X-Azure-FDID", async () => {
      const app = createHttpApp({ frontDoorId: FRONT_DOOR_ID });
      const res = await request(app)
        .post("/mcp")
        .set(JSON_RPC_HEADERS)
        .set("X-Azure-FDID", FRONT_DOOR_ID)
        .send(TOOLS_LIST);

      expect(res.status).toBe(200);
      const body = parseJsonRpcBody(res);
      const names = (body.result.tools as Array<{ name: string }>).map((t) => t.name);
      expect(names).toContain("zenon_docs_search");
    });

    it("does not check the header when frontDoorId is unset", async () => {
      const app = createHttpApp();
      const res = await request(app).post("/mcp").set(JSON_RPC_HEADERS).send(TOOLS_LIST);

      expect(res.status).toBe(200);
    });
  });
});

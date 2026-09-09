import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Mock the modules mcpServer.ts's tool handlers call into, so tests exercise
// only the wiring/formatting logic, without any real network or browser I/O.
vi.mock("../../src/siteApi.js", () => ({ resolveTarget: vi.fn() }));
vi.mock("../../src/search.js", () => ({ searchDocs: vi.fn() }));
vi.mock("../../src/fetchTopic.js", () => ({ fetchTopic: vi.fn() }));

import { createServer } from "../../src/mcpServer.js";
import { resolveTarget } from "../../src/siteApi.js";
import { searchDocs } from "../../src/search.js";
import { fetchTopic } from "../../src/fetchTopic.js";

const resolveTargetMock = vi.mocked(resolveTarget);
const searchDocsMock = vi.mocked(searchDocs);
const fetchTopicMock = vi.mocked(fetchTopic);

async function connectedClient() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content[0]?.text ?? "";
}

describe("createServer tools", () => {
  beforeEach(() => {
    resolveTargetMock.mockReset();
    searchDocsMock.mockReset();
    fetchTopicMock.mockReset();
  });

  describe("zenon_docs_search", () => {
    it("returns JSON-formatted results when matches are found", async () => {
      resolveTargetMock.mockResolvedValue({ product: "supervisor", version: "1600", lang: "en" });
      searchDocsMock.mockResolvedValue([
        {
          title: "Alarm administration",
          breadcrumb: "Data recording > Alarm Administration",
          snippet: "...",
          url: "https://onlinehelp.copadata.com/Content.html?id=1",
        },
      ]);
      const client = await connectedClient();

      const result = await client.callTool({ name: "zenon_docs_search", arguments: { query: "alarm" } });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(textOf(result));
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe("Alarm administration");
      expect(resolveTargetMock).toHaveBeenCalledWith(undefined, undefined, undefined);
      expect(searchDocsMock).toHaveBeenCalledWith({ product: "supervisor", version: "1600", lang: "en" }, "alarm");
    });

    it("passes optional product/version/lang through to resolveTarget", async () => {
      resolveTargetMock.mockResolvedValue({ product: "com", version: "10", lang: "de" });
      searchDocsMock.mockResolvedValue([]);
      const client = await connectedClient();

      await client.callTool({
        name: "zenon_docs_search",
        arguments: { query: "api", product: "com", version: "10", lang: "de" },
      });

      expect(resolveTargetMock).toHaveBeenCalledWith("com", "10", "de");
    });

    it("returns a 'no results' message with product/version interpolated when there are no matches", async () => {
      resolveTargetMock.mockResolvedValue({ product: "supervisor", version: "1600", lang: "en" });
      searchDocsMock.mockResolvedValue([]);
      const client = await connectedClient();

      const result = await client.callTool({ name: "zenon_docs_search", arguments: { query: "nope" } });

      expect(textOf(result)).toBe('No results found for "nope" in supervisor v1600.');
    });

    it("surfaces a resolveTarget rejection as a protocol-level tool error, not a thrown exception", async () => {
      // "bogus" is schema-valid (any string is a legal `version`), so this
      // exercises resolveTarget's own business-logic rejection rather than
      // zod input validation (an invalid `product` enum value, by contrast,
      // is rejected before the handler ever runs).
      resolveTargetMock.mockRejectedValue(new Error('Unknown version "bogus" for product "supervisor".'));
      const client = await connectedClient();

      const result = await client.callTool({
        name: "zenon_docs_search",
        arguments: { query: "x", version: "bogus" },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Unknown version "bogus" for product "supervisor"');
    });
  });

  describe("zenon_docs_fetch", () => {
    const url = "https://onlinehelp.copadata.com/Content.html?id=315662";

    it("formats title, breadcrumb and markdown", async () => {
      fetchTopicMock.mockResolvedValue({
        title: "Alarm administration",
        breadcrumb: "Data recording > Alarm Administration",
        markdown: "Some **content**.",
        sourceUrl: url,
      });
      const client = await connectedClient();

      const result = await client.callTool({ name: "zenon_docs_fetch", arguments: { url } });

      expect(textOf(result)).toBe(
        "# Alarm administration\n\nData recording > Alarm Administration\n\nSome **content**."
      );
      expect(fetchTopicMock).toHaveBeenCalledWith(url);
    });

    it("omits the breadcrumb header line when breadcrumb is empty", async () => {
      fetchTopicMock.mockResolvedValue({ title: "Home", breadcrumb: "", markdown: "Welcome.", sourceUrl: url });
      const client = await connectedClient();

      const result = await client.callTool({ name: "zenon_docs_fetch", arguments: { url } });

      expect(textOf(result)).toBe("# Home\n\nWelcome.");
    });

    it("surfaces a fetchTopic rejection as a protocol-level tool error", async () => {
      fetchTopicMock.mockRejectedValue(new Error("Could not find topic content for this url."));
      const client = await connectedClient();

      const result = await client.callTool({ name: "zenon_docs_fetch", arguments: { url } });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Could not find topic content");
    });
  });
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchTopic } from "./fetchTopic.js";
import { searchDocs } from "./search.js";
import { resolveTarget } from "./siteApi.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "zenon-docs-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "zenon_docs_search",
    {
      title: "Search zenon Online Help",
      description:
        "Search the official zenon user documentation (onlinehelp.copadata.com) and return up to 10 concise results " +
        "(title, breadcrumb path, snippet, and a permalink URL). Use this first to find relevant topics, then pass a " +
        "result's url to zenon_docs_fetch to read its full content.",
      inputSchema: {
        query: z.string().min(1).describe("Search terms, e.g. \"alarm administration\" or \"IIoT API\"."),
        product: z
          .enum(["supervisor", "com", "addin"])
          .optional()
          .describe(
            '"supervisor" = main zenon manual (default), "com" = COM API documentation, "addin" = Add-In API documentation.'
          ),
        version: z
          .string()
          .optional()
          .describe('Documentation version, e.g. "1600" for zenon 16. Defaults to the newest available version.'),
        lang: z.string().optional().describe('Language code, e.g. "en" (default) or "de".'),
      },
    },
    async ({ query, product, version, lang }) => {
      const target = await resolveTarget(product, version, lang);
      const results = await searchDocs(target, query);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No results found for "${query}" in ${target.product} v${target.version}.` }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  server.registerTool(
    "zenon_docs_fetch",
    {
      title: "Fetch a zenon Online Help topic",
      description:
        "Fetch the full content of a single zenon Online Help topic as markdown, given a permalink url " +
        "(as returned by zenon_docs_search, in the form https://onlinehelp.copadata.com/Content.html?product=...&version=...&lang=...&id=...).",
      inputSchema: {
        url: z.string().url().describe("A zenon Online Help topic permalink, typically copied from a zenon_docs_search result."),
      },
    },
    async ({ url }) => {
      const result = await fetchTopic(url);
      const header = result.breadcrumb ? `${result.breadcrumb}\n\n` : "";
      return {
        content: [{ type: "text", text: `# ${result.title}\n\n${header}${result.markdown}` }],
      };
    }
  );

  return server;
}

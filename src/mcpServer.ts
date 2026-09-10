import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DocSource } from "./docSource.js";
import { getActiveDocSource } from "./sourceConfig.js";

export function createServer(docSource: DocSource = getActiveDocSource()): McpServer {
  const server = new McpServer({
    name: "zenon-docs-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "zenon_docs_search",
    {
      title: docSource.tools.searchTool.title,
      description: docSource.tools.searchTool.description,
      inputSchema: {
        query: z.string().min(1).describe("Search terms, e.g. \"alarm administration\" or \"IIoT API\"."),
        ...docSource.searchParamsSchema,
      },
    },
    async ({ query, ...extra }) => {
      const { results, emptyResultContext } = await docSource.search(query, extra);
      if (results.length === 0) {
        const suffix = emptyResultContext ? ` ${emptyResultContext}` : "";
        return {
          content: [{ type: "text", text: `No results found for "${query}"${suffix}.` }],
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
      title: docSource.tools.fetchTool.title,
      description: docSource.tools.fetchTool.description,
      inputSchema: {
        url: z.string().url().describe(docSource.tools.fetchTool.urlParamDescription),
      },
    },
    async ({ url }) => {
      const result = await docSource.fetch(url);
      const header = result.breadcrumb ? `${result.breadcrumb}\n\n` : "";
      return {
        content: [{ type: "text", text: `# ${result.title}\n\n${header}${result.markdown}` }],
      };
    }
  );

  return server;
}

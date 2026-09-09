#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeBrowser } from "./browser.js";
import { createServer } from "./mcpServer.js";

const server = createServer();

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error starting zenon-docs-mcp:", err);
  process.exit(1);
});

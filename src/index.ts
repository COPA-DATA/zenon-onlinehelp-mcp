#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getActiveDocSource } from "./sourceConfig.js";
import { createServer } from "./mcpServer.js";

const docSource = getActiveDocSource();
const server = createServer(docSource);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

process.on("SIGINT", async () => {
  await docSource.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await docSource.close();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error starting zenon-docs-mcp:", err);
  process.exit(1);
});

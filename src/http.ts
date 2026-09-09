#!/usr/bin/env node
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { closeBrowser } from "./browser.js";
import { createServer } from "./mcpServer.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ALLOWED_HOSTS = process.env.ALLOWED_HOSTS
  ? process.env.ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean)
  : undefined;

const app = createMcpExpressApp({ host: HOST, allowedHosts: ALLOWED_HOSTS });

app.post("/mcp", async (req: Request, res: Response) => {
  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (_req: Request, res: Response) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    })
  );
});

app.delete("/mcp", async (_req: Request, res: Response) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    })
  );
});

app.listen(PORT, HOST, () => {
  console.log(`zenon-docs-mcp Streamable HTTP server listening on http://${HOST}:${PORT}/mcp`);
});

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});

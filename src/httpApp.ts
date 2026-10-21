// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ing. Punzenberger COPA-DATA GmbH

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Express, NextFunction, Request, Response } from "express";
import { createServer } from "./mcpServer.js";
import type { DocSource } from "./docSource.js";
import { getActiveDocSource } from "./sourceConfig.js";

export interface HttpAppOptions {
  host?: string;
  allowedHosts?: string[];
  /** When set, requests must carry a matching X-Azure-FDID header (Azure Front Door lockdown). */
  frontDoorId?: string;
  docSource?: DocSource;
}

export function createHttpApp(options: HttpAppOptions = {}): Express {
  const docSource = options.docSource ?? getActiveDocSource();
  const app = createMcpExpressApp({ host: options.host, allowedHosts: options.allowedHosts });

  if (options.frontDoorId) {
    const frontDoorId = options.frontDoorId;
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.header("x-azure-fdid") !== frontDoorId) {
        res.status(403).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Forbidden." },
          id: null,
        });
        return;
      }
      next();
    });
  }

  app.post("/mcp", async (req: Request, res: Response) => {
    // A new McpServer per request (existing behavior), but sharing the one
    // DocSource instance across all requests so its held resources (e.g.
    // the zenon source's pooled browser) aren't rebuilt on every call.
    const server = createServer(docSource);
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

  return app;
}

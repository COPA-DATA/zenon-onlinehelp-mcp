#!/usr/bin/env node
import { closeBrowser } from "./browser.js";
import { createHttpApp } from "./httpApp.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ALLOWED_HOSTS = process.env.ALLOWED_HOSTS
  ? process.env.ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean)
  : undefined;

const app = createHttpApp({ host: HOST, allowedHosts: ALLOWED_HOSTS });

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

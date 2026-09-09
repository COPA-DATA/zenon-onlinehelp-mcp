# zenon Docs MCP Server

An MCP server that exposes the official zenon user documentation
([onlinehelp.copadata.com](https://onlinehelp.copadata.com/)) to LLM tools,
the same way the Microsoft Learn MCP server exposes Microsoft/Azure docs:
a `search` tool for grounded, cited hits and a `fetch` tool for pulling a
specific topic's full content.

## Why this exists

`onlinehelp.copadata.com` is a JavaScript single-page app with no public
content API — topic text is only ever rendered client-side, there's no
sitemap, and a plain HTTP fetch of a topic URL returns an empty app shell.
This server drives a real headless browser (Playwright/Chromium) against
the site's own search box and topic viewer to get real answers, live, on
every call. It does not scrape or mirror the site in bulk.

## Tools

### `zenon_docs_search`

| Param | Required | Default | Notes |
|---|---|---|---|
| `query` | yes | — | Search terms |
| `product` | no | `supervisor` | `supervisor` (main manual), `com` (COM API docs), `addin` (Add-In API docs) |
| `version` | no | newest available | e.g. `1600` for zenon 16 |
| `lang` | no | `en` | e.g. `en`, `de` |

Returns up to 10 results: `{ title, breadcrumb, snippet, url }`.

### `zenon_docs_fetch`

| Param | Required | Notes |
|---|---|---|
| `url` | yes | A permalink as returned by `zenon_docs_search`, e.g. `https://onlinehelp.copadata.com/Content.html?product=supervisor&version=1600&lang=en&id=<documentId>` |

Returns the topic's title, breadcrumb, and full content as markdown.

## Setup

```bash
npm install
npm run build
```

`npm install` also downloads a Chromium build for Playwright (`postinstall`
runs `playwright install chromium`); this is a one-time, few-hundred-MB
download.

## Running

The server speaks MCP over stdio. Add it to your MCP client's config,
pointing at the built entrypoint:

```json
{
  "mcpServers": {
    "zenon-docs": {
      "command": "node",
      "args": ["/absolute/path/to/zenon_doc_mcp/dist/index.js"]
    }
  }
}
```

For Claude Code:

```bash
claude mcp add zenon-docs -- node /absolute/path/to/zenon_doc_mcp/dist/index.js
```

## Manual verification

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Then call `zenon_docs_search` with `{"query": "alarm administration"}` and
confirm you get results with valid `Content.html?...&id=` URLs, then call
`zenon_docs_fetch` with one of those URLs and confirm you get back markdown
content for that topic.

## Running in Docker

The image bundles Node, the compiled server, and a headless Chromium with
all its OS-level dependencies, so there's nothing to install on the host
besides Docker itself.

Build it:

```bash
docker build -t zenon-docs-mcp .
```

It's still a stdio MCP server, so run it with `-i` (keep stdin open) and
`--rm` (it's stateless — nothing worth keeping between runs):

```bash
docker run -i --rm zenon-docs-mcp
```

That will sit there speaking JSON-RPC on stdin/stdout, which is exactly
what an MCP client expects — it's not meant to print anything on its own.

### Registering the container with an MCP client

```json
{
  "mcpServers": {
    "zenon-docs": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "zenon-docs-mcp"]
    }
  }
}
```

For Claude Code:

```bash
claude mcp add zenon-docs -- docker run -i --rm zenon-docs-mcp
```

### Verifying the container

Same idea as the non-Docker path, just point the Inspector at `docker`
instead of `node`:

```bash
npx @modelcontextprotocol/inspector docker run -i --rm zenon-docs-mcp
```

### Notes

- Rebuild the image (`docker build -t zenon-docs-mcp .`) after any change
  to `src/`, `package.json`, or `package-lock.json` — there's no volume
  mount or live reload.
- The container launches a real headless Chromium per the same pooling
  logic as the non-Docker server (see [src/browser.ts](src/browser.ts)), so
  give it normal container resource limits, not the bare minimum — a
  starved container will make Playwright navigation time out.

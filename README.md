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

## Documentation source

The server can point at either of two sources for the same underlying
zenon documentation, selected via the `DOC_SOURCE` environment variable
(applies to both stdio and HTTP mode; read once at startup — an unknown
value crashes immediately with a descriptive error):

| `DOC_SOURCE` | Default | Description |
|---|---|---|
| `zenon` | ✅ (default) | `onlinehelp.copadata.com`, driven via headless Chromium as described above. |
| `copatools` | | `docs.copatools.com`'s public REST API (`docs-api-cd.copatools.com`) — no browser, no auth needed. Same product/version vocabulary as the `zenon` source. Configurable via `COPATOOLS_API_BASE_URL` (default `https://docs-api-cd.copatools.com`). |

The `copatools` source's `zenon_docs_fetch` doesn't yet resolve relative
image URLs to an absolute link (left as the raw relative path from the API)
— everything else (search, article content, cross-references) works the
same as the default source.

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

## Running as a remote server (Streamable HTTP)

In addition to stdio, the server can run as a standalone HTTP process
speaking the MCP Streamable HTTP transport — useful for a shared/remote
deployment instead of a per-client subprocess. It's stateless (a fresh
in-process `McpServer` handles each request, same tools as stdio), so
there's no session state to manage.

```bash
npm run build
npm run start:http
```

This listens on `http://127.0.0.1:3000/mcp` by default. Configure it with
environment variables:

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | Bind address. `127.0.0.1`/`localhost`/`::1` get automatic DNS-rebinding protection |
| `ALLOWED_HOSTS` | — | Comma-separated allowed `Host` header values; use when binding `0.0.0.0` so requests are still validated |
| `FRONT_DOOR_ID` | — | Azure Front Door profile ID; when set, requests without a matching `X-Azure-FDID` header get 403 (set automatically by the azd deployment) |
| `DOC_SOURCE` | `zenon` | See [Documentation source](#documentation-source) above |
| `COPATOOLS_API_BASE_URL` | `https://docs-api-cd.copatools.com` | Only used when `DOC_SOURCE=copatools` |

The single endpoint is `POST /mcp` (`GET`/`DELETE` return 405, since this
is stateless mode — no server-push streams or session termination).

Registering it with a client:

```bash
claude mcp add --transport http zenon-docs http://localhost:3000/mcp
```

```json
{
  "mcpServers": {
    "zenon-docs": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Verify with a plain JSON-RPC call:

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

or with the Inspector, pointed at the URL instead of a command:

```bash
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

**Security note:** there is no built-in authentication, CORS, or OAuth —
this is a stateless, read-only proxy over public documentation. If you
expose it beyond `localhost`, put it behind a reverse proxy, VPN, or
network ACL rather than opening it directly to the internet.

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

### Remote (Streamable HTTP) mode in Docker

Override the default command to boot `dist/http.js` instead, and publish
the port:

```bash
docker run -p 3000:3000 -e HOST=0.0.0.0 --rm zenon-docs-mcp dist/http.js
```

`HOST=0.0.0.0` is required so the server accepts connections from outside
the container; since that disables the automatic localhost DNS-rebinding
protection, also set `ALLOWED_HOSTS` (e.g.
`-e ALLOWED_HOSTS=my.public.hostname`) for any deployment reachable beyond
your own machine.

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
  logic as the non-Docker server (see
  [src/sources/zenon/browser.ts](src/sources/zenon/browser.ts)) when using
  the default `zenon` doc source, so give it normal container resource
  limits, not the bare minimum — a starved container will make Playwright
  navigation time out. The `copatools` source needs no browser at all.

## Deploying to Azure

`azd up` provisions two MCP servers on Azure Container Apps (see
[infra/](infra/)), both built from this image and each behind its own
endpoint on one **Azure Front Door Standard** profile:

| Container App | `DOC_SOURCE` | Public MCP URL (azd output) |
|---|---|---|
| `zenon-docs-mcp` | `zenon` | `AZURE_FRONT_DOOR_ENDPOINT` |
| `copatools-docs-mcp` | `copatools` | `AZURE_FRONT_DOOR_COPATOOLS_ENDPOINT` |

- Both URLs have the form `https://<endpoint>.azurefd.net/mcp`; see
  `azd env get-values`. A new Front Door endpoint can take several minutes
  (occasionally over half an hour) to start serving.
- The copatools server's API base URL defaults to `https://docs-api-cd.copatools.com`;
  override it with `azd env set COPATOOLS_API_BASE_URL <url>` followed by
  `azd provision`.
- Each Container App only accepts requests carrying this Front Door
  profile's `X-Azure-FDID` header (`FRONT_DOOR_ID`) and the origin `Host`
  (`ALLOWED_HOSTS`), so the direct `*.azurecontainerapps.io` URL returns 403.
- A WAF policy blocks client IPs that exceed 300 requests per minute
  (`rateLimitPerMinute` in [infra/modules/front-door.bicep](infra/modules/front-door.bicep)).
  Managed WAF rule sets would require the Premium tier.
- Front Door's origin response timeout is raised to 120s to leave room for
  slow Playwright-backed `zenon_docs_fetch` calls.

```bash
claude mcp add --transport http zenon-docs-azure https://<endpoint>.azurefd.net/mcp
claude mcp add --transport http copatools-docs-azure https://<copatools-endpoint>.azurefd.net/mcp
```

## License

[MIT](LICENSE) © 2026 Ing. Punzenberger COPA-DATA GmbH

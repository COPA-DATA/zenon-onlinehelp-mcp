# zenon Docs MCP Server
#
# This is a stdio MCP server (JSON-RPC over stdin/stdout), so run it with
# `docker run -i` (not detached, no TTY needed) — see README.md.

# ---- builder: compile TypeScript only, no browser download needed here ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_CHROMIUM_NO_SANDBOX=1

# Production deps only; --ignore-scripts skips the postinstall browser
# download here since we install Chromium + its OS deps explicitly below
# (the postinstall script is for local/non-Docker installs).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Installs the Chromium build matching the resolved playwright version, plus
# the OS packages (fonts, libnss3, etc.) it needs to actually launch headless.
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist

# Run as a non-root user; PLAYWRIGHT_BROWSERS_PATH above keeps the browser
# cache outside $HOME so it stays reachable after switching users.
RUN groupadd --system app \
    && useradd --system --gid app --create-home --home-dir /home/app app \
    && chown -R app:app /app /ms-playwright
USER app

ENTRYPOINT ["node", "dist/index.js"]

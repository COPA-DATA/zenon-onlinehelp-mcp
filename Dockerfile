# zenon Docs MCP Server
#
# Two modes, selected by the command passed at `docker run` time:
#   - stdio (default): JSON-RPC over stdin/stdout — `docker run -i --rm <image>`
#   - remote Streamable HTTP: `docker run -p 3000:3000 -e HOST=0.0.0.0 --rm <image> dist/http.js`
# See README.md.

# ---- builder: compile TypeScript only, no browser download needed here ----
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ---- test: install devDependencies, run the (non-browser) automated suite ----
FROM node:24-bookworm-slim AS test
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY test ./test

CMD ["npm", "test"]


# ---- runtime ----
# Must stay the last stage: azd's `docker` build has no --target selector, so
# it always builds whichever stage is last in this file.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_CHROMIUM_NO_SANDBOX=1

# Only used in remote Streamable HTTP mode (dist/http.js); no-op for stdio.
EXPOSE 3000

# Production deps only; --ignore-scripts skips the postinstall browser
# download here since we install Chromium + its OS deps explicitly below
# (the postinstall script is for local/non-Docker installs).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Installs the Chromium build matching the resolved playwright version, plus
# the OS packages (fonts, libnss3, etc.) it needs to actually launch headless.
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# The server only needs the node binary at runtime. Remove the npm, corepack and
# yarn tooling that ships with the base image, which would otherwise add
# unused packages (and their security advisories) to the final image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

COPY --from=builder /app/dist ./dist

# Run as a non-root user; PLAYWRIGHT_BROWSERS_PATH above keeps the browser
# cache outside $HOME so it stays reachable after switching users.
RUN groupadd --system app \
    && useradd --system --gid app --create-home --home-dir /home/app app \
    && chown -R app:app /app /ms-playwright
USER app

ENTRYPOINT ["node"]
CMD ["dist/index.js"]

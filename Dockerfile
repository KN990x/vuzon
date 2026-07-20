# Multi-stage build over a single pnpm workspace (see https://pnpm.io/docker).
# The runtime image carries no pnpm/corepack: only Node + the backend's prod deps + the built SPA.

FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV CI=true

RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

# ---- build: install the WHOLE workspace (one lockfile) and compile the SPA ----
FROM base AS build

WORKDIR /app

# Manifests first, so the workspace install stays cached.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY src/server/package.json ./src/server/package.json
COPY src/web/package.json ./src/web/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Source code + SPA build (produces src/web/dist).
COPY src ./src
RUN pnpm --filter @vuzon/web run build

# Self-contained backend bundle: code + production deps, with no workspace symlinks.
# --legacy: the backend uses no injected workspace dependencies (external packages only).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @vuzon/server deploy --prod --legacy /prod

# ---- runtime: minimal ----
FROM node:24-slim AS runtime

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Self-contained backend (server.js at the bundle root) + built SPA in /app/public.
COPY --from=build /prod ./
COPY --from=build /app/src/web/dist ./public

RUN chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=8001
# The SPA is served from a fixed path; this decouples the runtime from the source layout.
ENV VUZON_PUBLIC_DIR=/app/public
EXPOSE 8001

# node:24-slim ships no curl/wget; we probe /healthz with Node's global fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

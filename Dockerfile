# Multi-stage build over a single pnpm workspace (see https://pnpm.io/docker).
# Runtime image: Node + backend prod deps + built SPA (no pnpm/corepack).

FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV CI=true

RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

# ---- build ----
# Native builder: SPA + JS are arch-independent; only the runtime stage needs $TARGETPLATFORM.
FROM --platform=$BUILDPLATFORM base AS build

WORKDIR /app

# Manifests first so the install layer stays cached.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY src/server/package.json ./src/server/package.json
COPY src/web/package.json ./src/web/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# SPA sources only — backend edits must not invalidate the Vite layer.
COPY src/web ./src/web
RUN pnpm --filter @vuzon/web run build

COPY src/server ./src/server

# Self-contained backend bundle (--legacy: no injected workspace deps).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @vuzon/server deploy --prod --legacy /prod

# ---- runtime ----
FROM node:24-slim AS runtime

WORKDIR /app

# Explicit: every Cloudflare call is HTTPS.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# --chown on COPY avoids a second layer from `chown -R`.
COPY --from=build --chown=node:node /prod ./
COPY --from=build --chown=node:node /app/src/web/dist ./public

# Panel credentials + session key; mount a volume or they are lost on recreate.
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data

USER node

ENV NODE_ENV=production
ENV PORT=8001
ENV VUZON_PUBLIC_DIR=/app/public
ENV VUZON_DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 8001

# node:24-slim ships no curl/wget; probe /healthz with fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

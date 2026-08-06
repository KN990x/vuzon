# Multi-stage build over a single pnpm workspace (see https://pnpm.io/docker).
# The runtime image carries no pnpm/corepack: only Node + the backend's prod deps + the built SPA.

FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV CI=true

RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

# ---- build: install the WHOLE workspace (one lockfile) and compile the SPA ----
# --platform=$BUILDPLATFORM pins this stage to the NATIVE architecture of the builder. It
# is safe because everything it produces is architecture-independent — JS plus static
# assets — and none of the five runtime dependencies (cookie-session, dotenv, express,
# express-rate-limit, zod) is a native module. Without it the arm64 half of the release
# ran `pnpm install`, `tsc -b && vite build` and `pnpm deploy` under QEMU emulation, at
# roughly 10-30x the native cost. Only the runtime stage below needs $TARGETPLATFORM.
FROM --platform=$BUILDPLATFORM base AS build

WORKDIR /app

# Manifests first, so the workspace install stays cached.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY src/server/package.json ./src/server/package.json
COPY src/web/package.json ./src/web/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# The SPA sources ONLY, so that editing the backend (or a test) does not invalidate the
# Vite build layer. `COPY src ./src` put both packages in one layer, and a one-line change
# in features/auth/routes.js forced a full `tsc -b && vite build` on every build.
COPY src/web ./src/web
RUN pnpm --filter @vuzon/web run build

# Backend sources, after the SPA build for the same cache reason.
COPY src/server ./src/server

# Self-contained backend bundle: code + production deps, with no workspace symlinks.
# --legacy: the backend uses no injected workspace dependencies (external packages only).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @vuzon/server deploy --prod --legacy /prod

# ---- runtime: minimal ----
# No --platform here on purpose: this stage IS the target architecture.
FROM node:24-slim AS runtime

WORKDIR /app

# Kept explicitly even though node:24-slim is believed to ship these already: every
# Cloudflare call is HTTPS, so an empty trust store does not degrade the panel, it stops it
# working entirely. Not worth the layer saved on an assumption about a base image that can
# change under us.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Self-contained backend (server.js at the bundle root) + built SPA in /app/public.
# --chown on the COPY itself, never a `chown -R` afterwards: that rewrote every file of
# node_modules and of the SPA bundle into a second layer, duplicating them in the image.
COPY --from=build --chown=node:node /prod ./
COPY --from=build --chown=node:node /app/src/web/dist ./public

# State the panel writes itself: the credentials chosen in the setup wizard and the session
# signing key. Mount a volume here (docker-compose.yml does) or they are lost on every
# `docker compose up` and the setup wizard reopens.
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data

USER node

ENV NODE_ENV=production
ENV PORT=8001
# The SPA is served from a fixed path; this decouples the runtime from the source layout.
ENV VUZON_PUBLIC_DIR=/app/public
ENV VUZON_DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 8001

# node:24-slim ships no curl/wget; we probe /healthz with Node's global fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

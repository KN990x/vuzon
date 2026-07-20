# Build multi-stage sobre un workspace pnpm único (ver https://pnpm.io/docker).
# La imagen de runtime no lleva pnpm/corepack: solo Node + deps de prod del backend + la SPA compilada.

FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV CI=true

RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

# ---- build: instala TODO el workspace (un solo lockfile) y compila la SPA ----
FROM base AS build

WORKDIR /app

# Manifiestos primero para cachear la instalación del workspace.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY src/server/package.json ./src/server/package.json
COPY src/web/package.json ./src/web/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Código fuente + build de la SPA (genera src/web/dist).
COPY src ./src
RUN pnpm --filter @vuzon/web run build

# Bundle autocontenido del backend: código + deps de producción, sin symlinks del workspace.
# --legacy: el backend no usa dependencias de workspace inyectadas (solo paquetes externos).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @vuzon/server deploy --prod --legacy /prod

# ---- runtime: mínimo ----
FROM node:24-slim AS runtime

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Backend autocontenido (server.js en la raíz del bundle) + SPA compilada en /app/public.
COPY --from=build /prod ./
COPY --from=build /app/src/web/dist ./public

RUN chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=8001
# La SPA se sirve desde una ruta fija; desacopla el runtime del layout del código fuente.
ENV VUZON_PUBLIC_DIR=/app/public
EXPOSE 8001

# node:24-slim no trae curl/wget; sondeamos /healthz con el fetch global de Node.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

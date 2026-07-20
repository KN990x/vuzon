# Contributing to vuzon

Thanks for your interest in improving vuzon. This guide covers how to set up your environment, coding conventions, and how to propose changes.

**Note:** most people run vuzon with **Docker Compose** using only `docker-compose.yml` and `.env` (often from a release), without cloning. The sections below are for **contributors** working from a clone.

You can open issues for bugs or ideas, and pull requests for fixes or features.

## Before you start

- Read the [README](README.md) for the homelab-oriented install path and minimal environment variables.
- Use this document for **repository layout**, **build flow**, **HTTP routes**, and **deployment details** when developing or reviewing changes.
- For large or ambiguous changes, open an issue first to agree on scope.

## Development environment

- **Node.js 24** (LTS) or newer, matching the `Dockerfile` base image and CI (`setup-node`); see `engines` in `package.json`.
- **pnpm 11+** only (do not use npm or Yarn). Enable Corepack so the version in `package.json` → `packageManager` is used: `corepack enable`. Project settings live in [`pnpm-workspace.yaml`](pnpm-workspace.yaml) (pnpm 11 no longer reads non-auth settings from `.npmrc`).
- Create a `.env` in the project root (same fields as end users: Cloudflare token, `DOMAIN`, panel credentials). [`.env.example`](.env.example) is a minimal template; the full list of optional environment variables is in [README.md](README.md).

```bash
corepack enable
pnpm install
```

This is a single **pnpm workspace** with two packages: the backend `@vuzon/server` in `src/server/` and the React + Vite SPA `@vuzon/web` in `src/web/`. There is **one root `pnpm-lock.yaml`**; `pnpm install` at the root installs both.

```bash
pnpm run build    # builds the SPA (@vuzon/web) → src/web/dist
pnpm start        # build + start the server
```

`pnpm start` runs `pnpm run build` first (`pnpm --filter @vuzon/web run build`, which produces `src/web/dist`), then starts the backend (`pnpm --filter @vuzon/server run start`).

For frontend development with hot reload, run the backend (`pnpm --filter @vuzon/server run start`) and, in another terminal, `pnpm --filter @vuzon/web run dev` — the Vite dev server proxies `/api` to `http://127.0.0.1:8001` (see `src/web/vite.config.ts`).

## Where to make changes

- **Backend:** routes in `src/server/features/*/routes.js`; integrations in `src/server/platform/`; configuration in `src/server/config/`. Keep `src/server/server.js` as a thin entrypoint.
- **Frontend:** React app under `src/web/src/` (`screens/`, `components/`, pure helpers in `lib/`, translations in `i18n/`). Keep business logic in `src/web/src/lib/` so it stays unit-testable.
- **Tests:** backend coverage in `src/server/tests/unit/` and `src/server/tests/integration/`; smoke checks in `src/server/tests/architecture/`; frontend tests in `src/web/src/**/*.test.ts` (Vitest).

## Code conventions

- **ESM modules** (`"type": "module"` in `package.json`).
- **Validate HTTP inputs** at the edge with Zod; keep the JSON shapes already consumed by the UI or tests (`{ success: true }`, `{ ok: true, result }`, `{ result }`, `{ error, code }`, etc.). Zod issue messages are translation **slugs** (`alias.charset`), not prose.
- **User-visible copy lives in `src/web/src/i18n/`** — never as a literal in a component, and that includes `title`, `aria-label` and `placeholder`. `en.ts` is the source of truth and `es.ts` is type-checked against it, so a string added to one and not the other fails the build.
- **Server error messages are English fallbacks.** The panel picks the language, so a new error must carry a `code` from `src/server/platform/http/error-codes.js` and get an `error.<code>` entry in both catalogues; `tests/architecture/error-codes-guard.test.js` enforces it.
- **Session and cookies:** the client uses `credentials: 'include'`; any auth/session change should stay consistent across server, client, and tests.
- **Environment variables:** do not rename or relocate established conventions (`VUZON_PORT`, `SESSION_SECRET`, etc.) unless that is an explicit part of the change and covered by tests and README updates where applicable.
- Avoid new production or tooling dependencies when the current stack is enough.
- Prefer focused changes: do not mix large refactors with behavior changes in the same PR.

## How to validate changes

Before submitting a PR, on your machine:

```bash
pnpm run check
```

This runs the frontend build (TypeScript + Vite), syntax checks on `*.js` under `src/server`, ESLint (root) and oxlint (frontend), `node --test` (backend), and Vitest (frontend). See [Validation (details)](#validation-details) below for more context.

If you changed the **Dockerfile**, **docker-compose**, or **server startup**, also run:

```bash
docker build -t vuzon-local .
```

To run the stack from a clone **building the image locally** (instead of GHCR):

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d
```

End users normally use only [`docker-compose.yml`](docker-compose.yml) with the published image; see the [README](README.md).

Integration tests under `src/server/tests/integration/server/` start a temporary local server; in heavily restricted environments you may see `listen EPERM` even when the logic is correct.

## Pull requests

- Describe in full sentences **what** changes and **why**.
- Reference related issues when applicable.
- Add or update tests when behavior or HTTP/JSON contracts change.
- Confirm `pnpm run check` passes and `pnpm run build` still produces `src/web/dist` (the SPA bundle served by Express).

## License

By contributing, you agree your contributions are distributed under the same license as the project (see [LICENSE](LICENSE)).

---

## Technical reference

### Docker Compose (from a clone)

The bundled [`docker-compose.yml`](docker-compose.yml) pulls **`ghcr.io/kn990x/vuzon:latest`**, updated on stable GitHub Releases. Place `.env` in the project root and run `docker compose pull && docker compose up -d` like end users.

**Pin the image to match release files:** if you downloaded `docker-compose.yml` and `env.example` from a given Git tag (release assets; same template as `.env.example` in the repo), set the service `image` to the **same semver** published on GHCR for that release (registry tags usually **omit** the leading `v` from the Git tag). That keeps the running image aligned with the compose and env template you fetched.

**Build locally instead of pulling:** merge with [`docker-compose.build.yml`](docker-compose.build.yml):

`docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d`

**Compose details:**

- **`PORT=8001` inside the container** is set in Compose; **`VUZON_PORT`** in `.env` only changes the **host** side of `ports`. You do not need `PORT` in `.env` for this setup.
- **`env_file`**: `.env` is optional at Compose parse time (**Docker Compose v2.24+**); create it from `.env.example` so the app receives **`CF_API_TOKEN`**, **`DOMAIN`**, and panel credentials.

> The repository includes `.dockerignore` for faster local builds.

### Local execution without Docker

```bash
pnpm install
pnpm start
# App at http://localhost:8001 (unless overridden via env)
```

### Validation details

- `pnpm run check` executes the frontend build (TypeScript + Vite), syntax checks, ESLint + oxlint, `node --test`, and Vitest.
- Container validation stays aligned with the same layout assumptions via `docker build -t vuzon-local .`.
- Integration tests under `src/server/tests/integration/server/` open a temporary local server. In restricted sandboxes you may see `listen EPERM` even when the assertions are correct.

### Repository layout

- Single **pnpm workspace** (`packages: [src/server, src/web]`) with one root `pnpm-lock.yaml`. The root `package.json` is private and only orchestrates.
- `src/server/`: `@vuzon/server` backend source split into `bootstrap/`, `features/`, `platform/`, and `config/`; entrypoint `server.js`.
- `src/web/`: `@vuzon/web` — React + Vite SPA. App code in `src/web/src/` (`screens/`, `components/`, pure helpers in `lib/`).
- `src/web/dist/`: generated SPA bundle and the only directory served by Express at runtime (not versioned).
- `docs/assets/`: images referenced by the README (not served by the app).

#### The brand mark

The mailbox-on-amber-disc mark lives in three places, and they must stay identical:

| Where | What for |
|---|---|
| `src/web/public/favicon.svg` | Browser tab — the canonical copy |
| `VuzonMark` in `src/web/src/components/primitives.tsx` | Header and login screen (inline SVG) |
| `docs/assets/logo.svg` | README |

All three are **vectors on purpose**: an architecture test asserts they share the same `d` attributes, so editing one without the others fails CI. Keep it that way — a raster copy could not be diffed and would silently drift, which is exactly how the favicon ended up in a different brand's palette.

Colours come from the theme, never hardcoded twice: `VuzonMark` uses `currentColor` on `text-accent` plus `var(--color-ink)`, both defined in the `@theme` block of `src/web/src/index.css`.
- `src/server/shared/`: small cross-layer modules (for example Zod schemas consumed by both `config/` and `features/`). Keep it focused; avoid using it as a general dumping ground.
- `src/server/tests/unit/` and `src/server/tests/integration/`: primary backend coverage. `src/server/tests/integration/server/app.test.js` doubles as the HTTP contract — it exercises every route, so update it whenever a route or payload changes.
- `src/server/tests/architecture/`: lightweight smoke checks (expected repository layout, version alignment, forbidden dependencies).

#### About the `node_modules` directories

You will see more than one: the root `node_modules/` holds the real pnpm store (`node_modules/.pnpm/`), while `src/server/node_modules/` and `src/web/node_modules/` contain only **symlinks** into it. This is how pnpm workspaces work and nothing is duplicated on disk. If they ever look inconsistent, reinstall from the root rather than inside a package:

```bash
rm -rf node_modules src/server/node_modules src/web/node_modules
pnpm install
```

### Deployment notes

- **Sessions** use **`cookie-session`**: login payload is signed and stored in the **`vuzon_session`** cookie. There is no server-side session directory. Set **`SESSION_SECRET`** in the environment so the signing key is stable across restarts. With **`NODE_ENV=production`** (Docker runtime image), **`SESSION_SECRET` is required** (minimum 32 characters) and startup fails if it is missing; in development, if it is missing, the server generates an ephemeral secret (logins stop working after every restart). Session cookies are **not** `Secure` by default (`COOKIE_SECURE` opt-in) so homelab HTTP keeps working.
- **Multiple replicas** behind a load balancer can share the same **`SESSION_SECRET`**; the browser sends the signed cookie on each request, so sticky sessions are not required for auth. Note that logout revocation is **per process** (in-memory): with several replicas, a logout only invalidates copied cookies on the replica that served it.
- **Startup rejects `.env.example` placeholder values.** `SESSION_SECRET` in particular: it is published in a public repo, and the cookie is signed (not encrypted), so a known key lets anyone forge a logged-in session.
- **Logs** in typical production-style `NODE_ENV` do not print `AUTH_USER`; only whether panel credentials are configured.
- **`TRUST_PROXY`**: value for Express `app.set('trust proxy', …)`. Accepts a hop count (`1`, `2`, …), `loopback` / `linklocal` / `uniquelocal`, or an IP/CIDR list. **Off** unless you set it (e.g. `TRUST_PROXY=1` behind nginx/Traefik); an unrecognised value stays off and logs a warning. Needed for correct client IPs when rate-limiting `/api/login`.
- **Graceful shutdown**: `SIGTERM` / `SIGINT` close the HTTP server and exit `0`, with a 10s forced-exit fallback. `docker-compose.yml` sets `init: true` so the signal actually reaches the process.
- **JSON request bodies** for API routes are limited to **256kb**.
- **`CF_ZONE_ID` / `CF_ACCOUNT_ID`**: after autodetection or manual configuration, both must be non-empty and match Cloudflare-style identifiers (startup fails otherwise).
- **`VUZON_PUBLIC_DIR`**: optional override for the static/HTML directory (default `src/web/dist` resolved from the package layout; the Docker image sets it to `/app/public`).
- **`BASE_URL`:** **not a vuzon variable.** It appears in some reverse-proxy guides; the application never reads it. Setting it does nothing.

### Build and runtime flow

1. `pnpm --filter @vuzon/web run build` (`tsc -b && vite build`) generates the SPA bundle in `src/web/dist/`.
2. Express serves only `src/web/dist` (see `src/server/bootstrap/resolve-public-dir.js`; override with `VUZON_PUBLIC_DIR`), while backend routes stay in `src/server/features/*`.
3. Any non-`/api` GET serves `index.html` (SPA catch-all); the login screen is client state, not a separate page.

### Backend routes

The backend exposes login/session endpoints plus a REST proxy to Cloudflare. Cloudflare-facing routes and `GET /api/me` require an authenticated session.

Response envelope: reads return `{ result }`, mutations `{ ok: true }` (plus `result` when Cloudflare returns the resource), errors `{ error, code, params? }` — `error` is an English fallback and `code` is what the bilingual panel renders from. `/api/login` and `/api/logout` keep `{ success: true }`. All `/api/*` responses are sent with `Cache-Control: no-store`.

- `GET  /healthz` - Public endpoint that returns `{ ok: true }`.
- `POST /api/login` - Authenticates with `{ username, password }`. Wrong credentials return `401`.
- `POST /api/logout` - Closes the current session.
- `GET  /api/me` - Returns `{ email, rootDomain }` for the authenticated user.
- `GET  /api/addresses` - Lists destination addresses.
- `POST /api/addresses` - Creates destination address `{ email }`.
- `DELETE /api/addresses/:id` - Deletes destination address.
- `GET  /api/rules` - Lists rules/aliases.
- `POST /api/rules` - Creates rule `{ localPart, destEmail }` where `localPart` must already be lowercase and match `^[a-z0-9._-]+$` (1-64 chars), and `destEmail` must be a valid email **and an already-verified destination on the account**.
- `PUT  /api/rules/:id` - Changes an existing alias's destination `{ destEmail }`. Same catch-all guard and destination checks as above.
- `DELETE /api/rules/:id` - Deletes rule.
- `POST /api/rules/:id/enable` - Enables rule.
- `POST /api/rules/:id/disable` - Disables rule.

Unauthenticated requests to `/api/*` return `401 { error: "No autorizado" }` and do not redirect to the login page.

> Cloudflare API references for rules and addresses: official Cloudflare documentation.

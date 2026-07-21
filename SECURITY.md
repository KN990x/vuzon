# Security Policy

## Supported versions

Security fixes are applied to the latest release and to `main`. Older tags do not receive backports — please upgrade before reporting an issue that is already fixed upstream.

| Version | Supported |
| --- | --- |
| Latest release | ✅ |
| `main` | ✅ |
| Anything older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private vulnerability reporting: go to the [Security tab](https://github.com/KN990x/vuzon/security/advisories/new) and click **Report a vulnerability**. This opens a private channel visible only to the maintainer.

Helpful things to include:

- The affected version or commit
- What an attacker gains, and what access they need to start
- Steps to reproduce, ideally against a local Docker deployment
- Any relevant configuration (without real tokens, domains or credentials — use placeholders)

You can expect an initial reply within a few days. This is a hobby project maintained by one person, so please be patient with follow-ups. Once a fix is ready, it ships in a tagged release and the advisory is published with credit, unless you prefer to stay anonymous.

## Scope

vuzon is a **single-user, self-hosted panel** that talks only to the Cloudflare API. The following are deliberate design decisions rather than vulnerabilities:

- **No user management or roles.** There is exactly one account. It is created through the setup wizard on the first visit and stored as a scrypt hash (`auth.json`, mode `0600`) in the data directory.
- **The setup wizard is public until it is completed.** The panel ships with no credentials, so whoever reaches it first claims it — trust on first use, as in Uptime Kuma or Nextcloud. Once `auth.json` exists, `POST /api/setup` answers `409` for good, and the server warns on every boot while it is still unconfigured. Complete the setup as soon as the container is up. A report showing the wizard can be re-run against a configured panel *is* in scope.
- **There is no password recovery.** Deleting `auth.json` from the data volume reopens the wizard; that requires filesystem access to the host, which is already out of scope below.
- **The session cookie is signed, not encrypted.** It carries no secrets — only a login marker and an issue timestamp.
- **Plain HTTP keeps working.** `COOKIE_SECURE` and HSTS are opt-in so the panel can run on a LAN without TLS. Running it exposed to the internet without a TLS-terminating proxy is a deployment choice, not a bug in vuzon.
- **No CSRF token.** Protection relies on `sameSite: 'lax'` cookies, JSON-only mutations, the absence of CORS, and a same-origin guard on `/api` mutations (mismatched `Origin` → 403; clients without `Origin`/`Sec-Fetch-Site` such as curl still work). A report showing that this combination can be bypassed *is* in scope.
- **Session revocation is persisted.** A logout with a live session, or a password/username
  change, writes a revocation mark to the data directory (`session-epoch`). Cookies issued
  at or before that mark stay invalid across process restarts. An anonymous `POST /api/logout`
  clears only the caller's cookie and does not bump the revocation mark.
- **Destination deletion is check-then-act.** `DELETE /api/addresses/:id` lists rules (and
  the catch-all) and refuses when the address is still referenced. Between that check and
  Cloudflare's DELETE, another client could create a rule that uses the same destination;
  Cloudflare has no atomic "delete if unused" API, so that residual race is accepted. The
  panel fails closed when the usage check itself cannot complete.

Reports that require an attacker to already hold the `CF_API_TOKEN`, the panel credentials or shell access to the host are out of scope.

## Deployment reminders

Most incidents come from configuration, not code:

- Never commit your `.env`. Keep `CF_API_TOKEN` out of version control — it is the only secret left in the file. The panel password and the cookie signing key are not in `.env` at all: they live in the data directory (`data/`, gitignored), the password only as a hash.
- Give the Cloudflare token only the three scopes listed in the README. It should not be an account-wide token.
- Nothing to do about the session signing key: the panel generates a 256-bit one into the data directory (mode `0600`) on first boot and reuses it. It is deliberately not configurable — a signing key pasted into a `.env` was the single most damaging thing to get wrong, since the cookie is signed and a known key forges a logged-in session.
- Back up the data volume, and treat it as secret material: it holds the credential hash and the cookie signing key.
- Change the panel password from the key icon in the header rather than by editing files. Doing so signs every other session out, including a cookie copied earlier.
- Put the panel behind TLS and set `COOKIE_SECURE=1` if it is reachable from outside your network.

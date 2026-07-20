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

- **No user management or roles.** There is exactly one account, configured through `AUTH_USER` / `AUTH_PASS`.
- **The session cookie is signed, not encrypted.** It carries no secrets — only a login marker and an issue timestamp.
- **Plain HTTP keeps working.** `COOKIE_SECURE` and HSTS are opt-in so the panel can run on a LAN without TLS. Running it exposed to the internet without a TLS-terminating proxy is a deployment choice, not a bug in vuzon.
- **No CSRF token.** Protection relies on `sameSite: 'lax'` cookies, JSON-only mutations, the absence of CORS, and a same-origin guard on `/api` mutations (mismatched `Origin` → 403; clients without `Origin`/`Sec-Fetch-Site` such as curl still work). A report showing that this combination can be bypassed *is* in scope.
- **Session revocation is in-memory.** A logout with a live session invalidates existing cookies until the process restarts; an anonymous `POST /api/logout` clears only the caller's cookie and does not bump the revocation mark.

Reports that require an attacker to already hold the `CF_API_TOKEN`, the panel credentials or shell access to the host are out of scope.

## Deployment reminders

Most incidents come from configuration, not code:

- Never commit your `.env`. Keep `CF_API_TOKEN`, `AUTH_PASS` and `SESSION_SECRET` out of version control.
- Give the Cloudflare token only the three scopes listed in the README. It should not be an account-wide token.
- Set a real `SESSION_SECRET` (`openssl rand -hex 32`). `.env.example` ships it empty on purpose, and the startup guard also rejects known template values and secrets with no entropy.
- Put the panel behind TLS and set `COOKIE_SECURE=1` if it is reachable from outside your network.

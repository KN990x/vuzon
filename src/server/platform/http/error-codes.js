/**
 * Stable machine-readable codes for every user-facing API error.
 *
 * The panel is bilingual and the language lives in the browser (see
 * `src/web/src/i18n/`), so the server no longer decides which language the user reads.
 * Every error response carries `{ error, code, params? }`:
 *
 *   - `code`   is this table. The SPA renders the message from it.
 *   - `error`  is an ENGLISH fallback, for clients with no catalogue (curl, logs, a
 *              future CLI) and for codes the SPA does not know yet.
 *   - `params` carries the values interpolated into the message (an email, an alias),
 *              never anything coming from Cloudflare.
 *
 * The invariant from AGENTS.md still holds: no Cloudflare text reaches the client.
 * `CLOUDFLARE_GENERIC` is precisely the code for "something upstream failed and we are
 * not saying what".
 *
 * Adding a code here without adding it to `src/web/src/i18n/api-errors.ts` is a CI
 * failure (see tests/architecture/error-codes-guard.test.js).
 */
export const ERROR_CODES = Object.freeze({
  AUTH_CREDENTIALS_MISSING: 'auth.credentials_missing',
  AUTH_INVALID_CREDENTIALS: 'auth.invalid_credentials',
  AUTH_UNAUTHORIZED: 'auth.unauthorized',
  RATE_LIMIT_LOGIN: 'rate_limit.login',
  RATE_LIMIT_API: 'rate_limit.api',
  VALIDATION_INVALID: 'validation.invalid',
  REQUEST_MALFORMED: 'request.malformed',
  REQUEST_TOO_LARGE: 'request.too_large',
  RULES_CATCH_ALL_READONLY: 'rules.catch_all_readonly',
  RULES_NOT_EDITABLE: 'rules.not_editable',
  RULES_DUPLICATE_ALIAS: 'rules.duplicate_alias',
  DEST_UNKNOWN: 'dest.unknown',
  DEST_UNVERIFIED: 'dest.unverified',
  DEST_IN_USE: 'dest.in_use',
  DEST_USAGE_CHECK_FAILED: 'dest.usage_check_failed',
  CSRF_BLOCKED: 'csrf.blocked',
  CLOUDFLARE_GENERIC: 'cloudflare.generic',
  SERVER_INTERNAL: 'server.internal',
  SERVER_NOT_FOUND: 'server.not_found',
});

/**
 * Where the SPA goes after a request that means "this is not a live session".
 *
 * Logout calls this without a code and must land on login — not a loading flash
 * (`setSession('checking')` would re-fetch `/api/me` and blink "Loading…" on sign-out).
 *
 * Deleting `auth.json` is the documented password-reset path. The next API call then
 * answers `auth.setup_required`; that must reopen the wizard, not an unexplained login
 * form. The initial `/api/me` check already branched on the code; a 401 from the
 * Dashboard used to ignore it and always force `'anon'`.
 *
 * The HTTP status is not part of the decision: `requireAuth` sends 401, `POST /api/login`
 * with an empty store sends 409. Both carry the same code. Matching on status left the
 * login screen showing the right message and staying on the form.
 */
export function sessionAfterUnauthorized(code?: string): 'setup' | 'anon' {
  return code === 'auth.setup_required' ? 'setup' : 'anon';
}

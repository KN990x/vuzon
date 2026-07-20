/**
 * In-memory session revocation.
 *
 * The `vuzon_session` cookie is self-contained (signed, no server-side state), so
 * `POST /api/logout` can only remove it from the browser: a copy made beforehand would
 * stay valid for the full 7-day maxAge. Since the panel cannot persist anything (design
 * constraint: no database, no disk), we keep a timestamp in memory and discard sessions
 * issued before it.
 *
 * `revokedBefore` starts at 0 on purpose: restarting the process does NOT log the user
 * out (that is what you expect from a homelab panel that restarts on update). The only
 * thing lost on a restart is a previous revocation, and that gap is the same one already
 * accepted when several replicas share a SESSION_SECRET.
 */

let revokedBefore = 0;

/** Invalidates every session issued up to this moment. */
export function revokeSessionsIssuedUntilNow(now = Date.now()) {
  revokedBefore = now;
}

/**
 * @param {unknown} issuedAt The `issuedAt` mark stored in the session at login time.
 * @returns {boolean}
 */
export function isSessionIssuanceValid(issuedAt) {
  if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt)) {
    return false;
  }
  return issuedAt > revokedBefore;
}

/** Tests only: resets the state back to its startup value. */
export function resetSessionEpochForTests() {
  revokedBefore = 0;
}

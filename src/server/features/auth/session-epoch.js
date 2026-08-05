import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Session revocation mark.
 *
 * The `vuzon_session` cookie is self-contained (signed, no server-side state), so
 * `POST /api/logout` can only remove it from the browser: a copy made beforehand would
 * stay valid for the full 7-day maxAge. The mark below discards sessions issued at or
 * before it.
 *
 * It is persisted in the data directory (`session-epoch`) so a password change or logout
 * still invalidates stolen cookies after a process restart. Without that file a restart
 * used to reset the mark to 0 and revive every cookie issued before the revocation.
 *
 * A missing or empty file means "nothing revoked yet" (same as a fresh install). The panel
 * is single-process by design; several replicas sharing a volume would still race on this
 * file the same way they would on `auth.json`.
 */

const EPOCH_FILE_NAME = 'session-epoch';
const FILE_MODE = 0o600;

/** @type {number} */
let revokedBefore = 0;

/** @type {string | null} */
let epochFilePath = null;

/**
 * @param {string} filePath
 * @returns {number}
 */
function readEpochFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8').trim();
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return 0;
    }
    throw new Error(`The session epoch file ${filePath} could not be read: ${err.message}`);
  }

  if (raw === '') {
    return 0;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `The session epoch file ${filePath} is corrupt. Delete it to accept existing sessions `
        + 'again (logout and password-change revocations from before the corruption are lost).',
    );
  }
  return value;
}

/**
 * @param {string} filePath
 * @param {number} value
 */
function writeEpochFile(filePath, value) {
  // Unique temp name: a shared `${filePath}.tmp` let a second writer rmSync the file the
  // first had just written, so its renameSync threw ENOENT.
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  // Tests (and a first boot before anything else wrote here) may point at a data dir
  // that exists for credentials but has not been mkdir'd yet when only the epoch is
  // touched — create the parent the same way data-dir.js does for the volume root.
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(tmpPath, `${value}\n`, { mode: FILE_MODE });
    fs.chmodSync(tmpPath, FILE_MODE);
    fs.renameSync(tmpPath, filePath);
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

/**
 * Bind the in-memory mark to a file under `dataDir` and load whatever is already there.
 * Called once from `createApp` so every process start picks up revocations from before.
 *
 * @param {{ dataDir: string }} opts
 */
export function configureSessionEpochPersistence({ dataDir }) {
  epochFilePath = path.join(dataDir, EPOCH_FILE_NAME);
  revokedBefore = readEpochFile(epochFilePath);
}

/**
 * Invalidates every session issued up to this moment.
 *
 * The mark is `max(now, revokedBefore + 1)`, not `now`, for the mirror of the reason
 * documented on `nextIssuedAt`: that function hands out `revokedBefore + 1`, which is one
 * millisecond in the FUTURE when both run inside the same millisecond. A plain
 * `revokedBefore = now` then landed *below* the stamp it was supposed to revoke, so a
 * logout or password change occurring in the same millisecond as a login left that login
 * alive. Taking the max keeps the mark at or above every stamp issued so far.
 */
export function revokeSessionsIssuedUntilNow(now = Date.now()) {
  revokedBefore = Math.max(now, revokedBefore + 1);
  if (epochFilePath) {
    writeEpochFile(epochFilePath, revokedBefore);
  }
}

/**
 * Stamp for a session being issued right now, guaranteed to survive the check below.
 *
 * `Date.now()` alone is not enough: logging out and logging back in within the same
 * millisecond produced `issuedAt === revokedBefore`, which `isSessionIssuanceValid`
 * rejects — the login succeeded and the very next request answered 401.
 *
 * @param {number} [now]
 * @returns {number}
 */
export function nextIssuedAt(now = Date.now()) {
  return Math.max(now, revokedBefore + 1);
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

/**
 * Tests only: resets the in-memory mark and, when persistence is configured, clears the
 * on-disk value so the next revocation starts from a clean slate. The file path stays
 * bound so later revokes in the same `createApp` still persist.
 */
export function resetSessionEpochForTests() {
  revokedBefore = 0;
  if (epochFilePath) {
    fs.rmSync(epochFilePath, { force: true });
  }
}

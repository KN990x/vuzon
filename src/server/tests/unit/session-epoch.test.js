import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  configureSessionEpochPersistence,
  isSessionIssuanceValid,
  nextIssuedAt,
  resetSessionEpochForTests,
  revokeSessionsIssuedUntilNow,
} from '../../features/auth/session-epoch.js';
import { SESSION_MAX_AGE_MS } from '../../platform/session/middleware.js';

function tempDataDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuzon-epoch-'));
  t.after(() => {
    resetSessionEpochForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test('session-epoch: at startup, any session with issuedAt is valid', () => {
  resetSessionEpochForTests();
  assert.equal(isSessionIssuanceValid(Date.now()), true);
  // Sessions from earlier versions (with no issuedAt) are discarded.
  assert.equal(isSessionIssuanceValid(undefined), false);
  assert.equal(isSessionIssuanceValid('1700000000000'), false);
  assert.equal(isSessionIssuanceValid(Number.NaN), false);
});

// These tests drive the revocation mark with a synthetic clock, so they must hand
// `isSessionIssuanceValid` the same clock: stamps like `2_001` are January 1970 against a
// real `Date.now()`, and the age check below would reject them for being 56 years old
// rather than for anything to do with revocation.
const CLOCK = 2_000;

test('session-epoch: revoking invalidates earlier sessions and not later ones', () => {
  resetSessionEpochForTests();
  const before = 1_000;
  revokeSessionsIssuedUntilNow(CLOCK);

  assert.equal(isSessionIssuanceValid(before, CLOCK), false);
  assert.equal(isSessionIssuanceValid(CLOCK, CLOCK), false, 'the exact instant is revoked too');
  assert.equal(isSessionIssuanceValid(2_001, CLOCK), true);

  resetSessionEpochForTests();
});

test('session-epoch: logging in on the same millisecond as the logout still works', () => {
  resetSessionEpochForTests();
  revokeSessionsIssuedUntilNow(CLOCK);

  // The bug: `Date.now()` alone gave issuedAt === revokedBefore, which is revoked, so the
  // login succeeded and the very next request answered 401.
  assert.equal(isSessionIssuanceValid(CLOCK, CLOCK), false);
  assert.equal(isSessionIssuanceValid(nextIssuedAt(CLOCK), CLOCK), true);

  resetSessionEpochForTests();
});

test('session-epoch: with no recent revocation, nextIssuedAt is just the clock', () => {
  resetSessionEpochForTests();
  assert.equal(nextIssuedAt(1_700_000_000_000), 1_700_000_000_000);
});

test('session-epoch: persistence reloads the mark from the data directory', (t) => {
  const dataDir = tempDataDir(t);
  resetSessionEpochForTests();
  configureSessionEpochPersistence({ dataDir });
  revokeSessionsIssuedUntilNow(5_000);

  assert.equal(
    fs.readFileSync(path.join(dataDir, 'session-epoch'), 'utf8').trim(),
    '5000',
  );

  // Re-configure as a fresh process would: memory is whatever configure reads from disk.
  configureSessionEpochPersistence({ dataDir });
  assert.equal(isSessionIssuanceValid(4_999, 5_000), false);
  assert.equal(isSessionIssuanceValid(5_001, 5_000), true);
});

test('session-epoch: a session older than its maximum age is rejected without any revocation', () => {
  resetSessionEpochForTests();
  const now = Date.now();

  // Nothing has been revoked here — `revokedBefore` is 0. The only thing that can reject
  // these is the age check, which is the point: `cookie-session` embeds no expiry, so the
  // 7-day maxAge is a browser hint and a captured cookie replayed months later used to
  // authenticate exactly as well as a fresh one.
  assert.equal(isSessionIssuanceValid(now - SESSION_MAX_AGE_MS - 1, now), false);
  assert.equal(isSessionIssuanceValid(now - SESSION_MAX_AGE_MS, now), false, 'the boundary is expired too');
  assert.equal(isSessionIssuanceValid(now - SESSION_MAX_AGE_MS + 1, now), true);
  assert.equal(isSessionIssuanceValid(now, now), true);
});

test('session-epoch: a failed epoch write leaves the in-memory mark untouched', (t) => {
  const dataDir = tempDataDir(t);
  resetSessionEpochForTests();
  configureSessionEpochPersistence({ dataDir });
  revokeSessionsIssuedUntilNow(5_000);

  // Make the write fail the way a full or read-only volume would: a FILE where the epoch's
  // parent directory is expected makes both the mkdir and the write throw.
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.writeFileSync(dataDir, 'not a directory');

  assert.throws(() => revokeSessionsIssuedUntilNow(9_000));

  // The mark must NOT have moved. Raising it in memory before persisting logged the caller
  // out of their own tab for a revocation that never reached disk — and the next restart
  // reloaded the older value, reviving every cookie the revocation was meant to kill.
  // Both marks below still describe the state after the FIRST (successful) revoke.
  assert.equal(isSessionIssuanceValid(5_001, 5_500), true, 'not revoked by the failed write');
  assert.equal(isSessionIssuanceValid(5_000, 5_500), false, 'the earlier revoke still holds');

  // Put a real directory back: the `after` hook resets the epoch, and rmSync on a path
  // whose parent is a plain file throws ENOTDIR and fails the test during cleanup.
  fs.rmSync(dataDir, { force: true });
  fs.mkdirSync(dataDir, { recursive: true });
});

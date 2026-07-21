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

test('session-epoch: revoking invalidates earlier sessions and not later ones', () => {
  resetSessionEpochForTests();
  const before = 1_000;
  revokeSessionsIssuedUntilNow(2_000);

  assert.equal(isSessionIssuanceValid(before), false);
  assert.equal(isSessionIssuanceValid(2_000), false, 'the exact instant is revoked too');
  assert.equal(isSessionIssuanceValid(2_001), true);

  resetSessionEpochForTests();
});

test('session-epoch: logging in on the same millisecond as the logout still works', () => {
  resetSessionEpochForTests();
  const now = 2_000;
  revokeSessionsIssuedUntilNow(now);

  // The bug: `Date.now()` alone gave issuedAt === revokedBefore, which is revoked, so the
  // login succeeded and the very next request answered 401.
  assert.equal(isSessionIssuanceValid(now), false);
  assert.equal(isSessionIssuanceValid(nextIssuedAt(now)), true);

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
  assert.equal(isSessionIssuanceValid(4_999), false);
  assert.equal(isSessionIssuanceValid(5_001), true);
});

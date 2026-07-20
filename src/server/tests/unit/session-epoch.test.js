import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isSessionIssuanceValid,
  nextIssuedAt,
  resetSessionEpochForTests,
  revokeSessionsIssuedUntilNow,
} from '../../features/auth/session-epoch.js';

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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isSessionIssuanceValid,
  resetSessionEpochForTests,
  revokeSessionsIssuedUntilNow,
} from '../../features/auth/session-epoch.js';

test('session-epoch: al arrancar, cualquier sesión con issuedAt es válida', () => {
  resetSessionEpochForTests();
  assert.equal(isSessionIssuanceValid(Date.now()), true);
  // Sesiones de versiones anteriores (sin issuedAt) se descartan.
  assert.equal(isSessionIssuanceValid(undefined), false);
  assert.equal(isSessionIssuanceValid('1700000000000'), false);
  assert.equal(isSessionIssuanceValid(Number.NaN), false);
});

test('session-epoch: revocar invalida las sesiones anteriores y no las posteriores', () => {
  resetSessionEpochForTests();
  const antes = 1_000;
  revokeSessionsIssuedUntilNow(2_000);

  assert.equal(isSessionIssuanceValid(antes), false);
  assert.equal(isSessionIssuanceValid(2_000), false, 'el instante exacto también se revoca');
  assert.equal(isSessionIssuanceValid(2_001), true);

  resetSessionEpochForTests();
});

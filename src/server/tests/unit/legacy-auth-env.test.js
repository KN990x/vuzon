import assert from 'node:assert/strict';
import { test } from 'node:test';
import { warnIfLegacyAuthEnvVarsSet } from '../../config/legacy-auth-env.js';

test('legacy-auth-env: no warning when the keys are absent or blank', () => {
  const warnings = [];
  warnIfLegacyAuthEnvVarsSet(
    { AUTH_USER: '   ', AUTH_PASS: '', SESSION_SECRET: undefined },
    { warn: (message) => warnings.push(message) },
  );
  assert.deepEqual(warnings, []);
});

test('legacy-auth-env: warns about a single leftover key', () => {
  const warnings = [];
  warnIfLegacyAuthEnvVarsSet(
    { AUTH_USER: 'admin' },
    { warn: (message) => warnings.push(message) },
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /AUTH_USER is set but ignored since v2\.0/);
  assert.match(warnings[0], /VUZON_DATA_DIR/);
});

test('legacy-auth-env: lists every leftover key in one warning', () => {
  const warnings = [];
  warnIfLegacyAuthEnvVarsSet(
    {
      AUTH_USER: 'admin',
      AUTH_PASS: 'secret-from-1x',
      SESSION_SECRET: 'old-session-secret',
    },
    { warn: (message) => warnings.push(message) },
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /AUTH_USER, AUTH_PASS, SESSION_SECRET are set but ignored/);
});

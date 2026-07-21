import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MIN_PASSWORD_LENGTH,
  passwordChangeBodySchema,
  setupBodySchema,
  usernameChangeBodySchema,
} from '../../features/auth/setup-body.js';
import { collectZodIssues } from '../../platform/http/format-zod-error.js';

const PASSWORD = 'a-long-enough-password';

/** @returns {Array<{ field: string, code: string }>} */
function issuesOf(schema, body) {
  const result = schema.safeParse(body);
  assert.equal(result.success, false, 'expected the body to be rejected');
  return collectZodIssues(result.error);
}

test('setup: a valid body passes', () => {
  const parsed = setupBodySchema.parse({
    username: 'kn',
    password: PASSWORD,
    passwordConfirm: PASSWORD,
  });
  assert.equal(parsed.username, 'kn');
  assert.equal(parsed.password, PASSWORD);
});

test('setup: username and password are trimmed', () => {
  const parsed = setupBodySchema.parse({
    username: '  kn  ',
    password: ` ${PASSWORD} `,
    passwordConfirm: PASSWORD,
  });
  assert.equal(parsed.username, 'kn');
  // Trimmed on both sides, so the confirmation still matches: what login later compares
  // is the trimmed value (see login-body.js).
  assert.equal(parsed.password, PASSWORD);
});

test('setup: a missing username is a slug, not prose', () => {
  const issues = issuesOf(setupBodySchema, {
    username: '   ',
    password: PASSWORD,
    passwordConfirm: PASSWORD,
  });
  assert.deepEqual(issues, [{ field: 'username', code: 'username.required' }]);
});

test('setup: a short password', () => {
  const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
  const issues = issuesOf(setupBodySchema, {
    username: 'kn',
    password: short,
    passwordConfirm: short,
  });
  assert.deepEqual(issues, [{ field: 'password', code: 'password.too_short' }]);
});

test('setup: the confirmation must match, and the issue points at the confirmation field', () => {
  const issues = issuesOf(setupBodySchema, {
    username: 'kn',
    password: PASSWORD,
    passwordConfirm: `${PASSWORD}!`,
  });
  assert.deepEqual(issues, [{ field: 'passwordConfirm', code: 'password.mismatch' }]);
});

test('setup: a non-string password is rejected', () => {
  const issues = issuesOf(setupBodySchema, {
    username: 'kn',
    password: { toString: () => PASSWORD },
    passwordConfirm: PASSWORD,
  });
  assert.deepEqual(issues, [{ field: 'password', code: 'password.invalid' }]);
});

test('password change: a valid body passes', () => {
  const parsed = passwordChangeBodySchema.parse({
    currentPassword: 'whatever-it-was',
    newPassword: PASSWORD,
    newPasswordConfirm: PASSWORD,
  });
  assert.equal(parsed.newPassword, PASSWORD);
});

test('password change: the current password is required', () => {
  const issues = issuesOf(passwordChangeBodySchema, {
    currentPassword: '',
    newPassword: PASSWORD,
    newPasswordConfirm: PASSWORD,
  });
  assert.deepEqual(issues, [{ field: 'currentPassword', code: 'password.current_required' }]);
});

test('password change: the new password has to meet the policy and be confirmed', () => {
  const issues = issuesOf(passwordChangeBodySchema, {
    currentPassword: 'whatever-it-was',
    newPassword: PASSWORD,
    newPasswordConfirm: 'something-else-entirely',
  });
  assert.deepEqual(issues, [{ field: 'newPasswordConfirm', code: 'password.mismatch' }]);
});

test('username change: a valid body passes and trims the new username', () => {
  const parsed = usernameChangeBodySchema.parse({
    newUsername: '  owner  ',
    currentPassword: PASSWORD,
  });
  assert.equal(parsed.newUsername, 'owner');
  assert.equal(parsed.currentPassword, PASSWORD);
});

test('username change: the current password is required', () => {
  const issues = issuesOf(usernameChangeBodySchema, {
    newUsername: 'owner',
    currentPassword: '',
  });
  assert.deepEqual(issues, [{ field: 'currentPassword', code: 'password.current_required' }]);
});

test('username change: an empty new username is a slug', () => {
  const issues = issuesOf(usernameChangeBodySchema, {
    newUsername: '   ',
    currentPassword: PASSWORD,
  });
  assert.deepEqual(issues, [{ field: 'newUsername', code: 'username.required' }]);
});

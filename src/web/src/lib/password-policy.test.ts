import { expect, test } from 'vitest';
import { checkNewPassword, MIN_PASSWORD_LENGTH } from './password-policy';

const valid = 'a-long-enough-password';

test('a password that meets the policy passes', () => {
  expect(checkNewPassword(valid, valid)).toBeNull();
});

test('an empty password is reported as missing, not as too short', () => {
  expect(checkNewPassword('', '')).toBe('password.required');
  expect(checkNewPassword('   ', '   ')).toBe('password.required');
});

test('below the minimum length', () => {
  const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
  expect(checkNewPassword(short, short)).toBe('password.too_short');

  const exact = 'x'.repeat(MIN_PASSWORD_LENGTH);
  expect(checkNewPassword(exact, exact)).toBeNull();
});

test('the confirmation must match', () => {
  expect(checkNewPassword(valid, `${valid}!`)).toBe('password.mismatch');
});

test('both fields are trimmed, like the server schema', () => {
  // The server stores the trimmed value, so a trailing space must not count as a mismatch
  // here either — otherwise the panel would reject what the server would have accepted.
  expect(checkNewPassword(` ${valid} `, valid)).toBeNull();
  expect(checkNewPassword(` ${'x'.repeat(MIN_PASSWORD_LENGTH - 1)} `, '')).toBe('password.too_short');
});

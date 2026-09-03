import { expect, test } from 'vitest';
import { sessionAfterUnauthorized } from './session';

test('a setup_required code reopens the wizard, whatever the HTTP status', () => {
  // 401 from requireAuth and 409 from POST /api/login with an empty store.
  expect(sessionAfterUnauthorized('auth.setup_required')).toBe('setup');
});

test('a plain unauthorized 401, or no code, goes to login', () => {
  expect(sessionAfterUnauthorized('auth.unauthorized')).toBe('anon');
  expect(sessionAfterUnauthorized()).toBe('anon');
  expect(sessionAfterUnauthorized(undefined)).toBe('anon');
});

test('an unknown code is not treated as an unconfigured panel', () => {
  expect(sessionAfterUnauthorized('auth.invalid_credentials')).toBe('anon');
});

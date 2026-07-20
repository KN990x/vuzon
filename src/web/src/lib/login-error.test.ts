import { expect, test } from 'vitest';
import { buildLoginErrorMessage } from './login-error';
import { ApiError, UnauthorizedError } from './api';
import { createTranslator } from '../i18n/locale';

const en = createTranslator('en');
const es = createTranslator('es');

test('server errors are translated by code, in both languages', () => {
  const err = new UnauthorizedError('Invalid credentials', { code: 'auth.invalid_credentials' });
  expect(buildLoginErrorMessage(en, err)).toBe('Invalid credentials');
  expect(buildLoginErrorMessage(es, err)).toBe('Credenciales incorrectas');

  const limited = new ApiError('Too many attempts.', 429, { code: 'rate_limit.login' });
  expect(buildLoginErrorMessage(es, limited)).toBe(
    'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  );
});

test('an unknown code falls back to the English text the server sent', () => {
  const err = new ApiError('Brand new failure', 400, { code: 'something.new' });
  expect(buildLoginErrorMessage(es, err)).toBe('Brand new failure');
});

test('a non-JSON 5xx response (proxy) → server error message', () => {
  const nonJson = new ApiError('Unexpected response', 502, { code: 'client.non_json' });
  expect(buildLoginErrorMessage(en, nonJson)).toBe('Server error. Please try again.');

  const badJson = new ApiError('Invalid JSON', 500, { code: 'client.invalid_json' });
  expect(buildLoginErrorMessage(es, badJson)).toBe('Error del servidor. Inténtalo de nuevo.');
});

test('a non-JSON, non-5xx response keeps the status', () => {
  const err = new ApiError('Unexpected response', 404, { code: 'client.non_json' });
  expect(buildLoginErrorMessage(en, err)).toBe('Could not sign in (HTTP 404)');
  expect(buildLoginErrorMessage(es, err)).toBe('No se pudo iniciar sesión (HTTP 404)');
});

test('network failure (fetch TypeError) → connection message', () => {
  expect(buildLoginErrorMessage(es, new TypeError('Failed to fetch'))).toBe(
    'No se pudo conectar con el servidor. Comprueba tu conexión.',
  );
});

test('non-Error or empty values → generic message', () => {
  expect(buildLoginErrorMessage(en, 'boom')).toBe('Could not sign in');
  expect(buildLoginErrorMessage(en, new Error(''))).toBe('Could not sign in');
});

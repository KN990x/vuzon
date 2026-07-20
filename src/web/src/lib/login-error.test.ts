import { expect, test } from 'vitest';
import { buildLoginErrorMessage } from './login-error';
import { UnauthorizedError } from './api';

test('server messages are shown verbatim (401/429/400)', () => {
  expect(buildLoginErrorMessage(new UnauthorizedError('Credenciales incorrectas'))).toBe(
    'Credenciales incorrectas',
  );
  expect(
    buildLoginErrorMessage(new Error('Demasiados intentos. Espera un momento e inténtalo de nuevo.')),
  ).toBe('Demasiados intentos. Espera un momento e inténtalo de nuevo.');
});

test('a non-JSON 5xx response (proxy) → server error message', () => {
  expect(buildLoginErrorMessage(new Error('Respuesta inesperada del servidor (502)'))).toBe(
    'Error del servidor. Inténtalo de nuevo.',
  );
  expect(buildLoginErrorMessage(new Error('Respuesta JSON inválida del servidor (500)'))).toBe(
    'Error del servidor. Inténtalo de nuevo.',
  );
});

test('a non-JSON, non-5xx response keeps the status', () => {
  expect(buildLoginErrorMessage(new Error('Respuesta inesperada del servidor (404)'))).toBe(
    'No se pudo iniciar sesión (HTTP 404)',
  );
});

test('network failure (fetch TypeError) → connection message', () => {
  expect(buildLoginErrorMessage(new TypeError('Failed to fetch'))).toBe(
    'No se pudo conectar con el servidor. Comprueba tu conexión.',
  );
});

test('non-Error values → generic message', () => {
  expect(buildLoginErrorMessage('boom')).toBe('No se pudo iniciar sesión');
  expect(buildLoginErrorMessage(new Error(''))).toBe('No se pudo iniciar sesión');
});

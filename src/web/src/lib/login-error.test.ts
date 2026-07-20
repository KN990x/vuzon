import { expect, test } from 'vitest';
import { buildLoginErrorMessage } from './login-error';
import { UnauthorizedError } from './api';

test('mensajes del servidor se muestran tal cual (401/429/400)', () => {
  expect(buildLoginErrorMessage(new UnauthorizedError('Credenciales incorrectas'))).toBe(
    'Credenciales incorrectas',
  );
  expect(
    buildLoginErrorMessage(new Error('Demasiados intentos. Espera un momento e inténtalo de nuevo.')),
  ).toBe('Demasiados intentos. Espera un momento e inténtalo de nuevo.');
});

test('respuesta no-JSON 5xx (proxy) → mensaje de error de servidor', () => {
  expect(buildLoginErrorMessage(new Error('Respuesta inesperada del servidor (502)'))).toBe(
    'Error del servidor. Inténtalo de nuevo.',
  );
  expect(buildLoginErrorMessage(new Error('Respuesta JSON inválida del servidor (500)'))).toBe(
    'Error del servidor. Inténtalo de nuevo.',
  );
});

test('respuesta no-JSON no-5xx conserva el status', () => {
  expect(buildLoginErrorMessage(new Error('Respuesta inesperada del servidor (404)'))).toBe(
    'No se pudo iniciar sesión (HTTP 404)',
  );
});

test('fallo de red (TypeError del fetch) → mensaje de conexión', () => {
  expect(buildLoginErrorMessage(new TypeError('Failed to fetch'))).toBe(
    'No se pudo conectar con el servidor. Comprueba tu conexión.',
  );
});

test('valores no-Error → mensaje genérico', () => {
  expect(buildLoginErrorMessage('boom')).toBe('No se pudo iniciar sesión');
  expect(buildLoginErrorMessage(new Error(''))).toBe('No se pudo iniciar sesión');
});

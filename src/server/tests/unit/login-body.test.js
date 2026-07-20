import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginBodySchema } from '../../features/auth/login-body.js';

test('loginBodySchema: accepts user and password', () => {
  const parsed = loginBodySchema.parse({
    username: 'admin',
    password: 'secret',
  });
  assert.deepEqual(parsed, { username: 'admin', password: 'secret' });
});

test('loginBodySchema: applies trim', () => {
  const parsed = loginBodySchema.parse({
    username: '  admin  ',
    password: '  secret  ',
  });
  assert.deepEqual(parsed, { username: 'admin', password: 'secret' });
});

test('loginBodySchema: rejects an empty value after trim', () => {
  assert.throws(
    () => loginBodySchema.parse({ username: '   ', password: 'x' }),
    /Usuario requerido/,
  );
  assert.throws(
    () => loginBodySchema.parse({ username: 'x', password: '   ' }),
    /Contraseña requerida/,
  );
});

test('loginBodySchema: rejects missing fields or an invalid type', () => {
  assert.throws(() => loginBodySchema.parse({}), /Usuario requerido/);
  assert.throws(
    () => loginBodySchema.parse({ username: 1, password: 'x' }),
    /Usuario inválido/,
  );
});

test('loginBodySchema: rejects overly long fields', () => {
  const long = 'a'.repeat(257);
  assert.throws(
    () => loginBodySchema.parse({ username: long, password: 'x' }),
    /demasiado largo/i,
  );
  assert.throws(
    () => loginBodySchema.parse({ username: 'x', password: long }),
    /demasiado larga/i,
  );
});

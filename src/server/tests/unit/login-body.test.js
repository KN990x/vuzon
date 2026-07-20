import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginBodySchema } from '../../features/auth/login-body.js';

test('loginBodySchema: acepta usuario y contraseña', () => {
  const parsed = loginBodySchema.parse({
    username: 'admin',
    password: 'secret',
  });
  assert.deepEqual(parsed, { username: 'admin', password: 'secret' });
});

test('loginBodySchema: aplica trim', () => {
  const parsed = loginBodySchema.parse({
    username: '  admin  ',
    password: '  secret  ',
  });
  assert.deepEqual(parsed, { username: 'admin', password: 'secret' });
});

test('loginBodySchema: rechaza vacío tras trim', () => {
  assert.throws(
    () => loginBodySchema.parse({ username: '   ', password: 'x' }),
    /Usuario requerido/,
  );
  assert.throws(
    () => loginBodySchema.parse({ username: 'x', password: '   ' }),
    /Contraseña requerida/,
  );
});

test('loginBodySchema: rechaza campos ausentes o tipo inválido', () => {
  assert.throws(() => loginBodySchema.parse({}), /Usuario requerido/);
  assert.throws(
    () => loginBodySchema.parse({ username: 1, password: 'x' }),
    /Usuario inválido/,
  );
});

test('loginBodySchema: rechaza campos demasiado largos', () => {
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

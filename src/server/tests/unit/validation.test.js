import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressSchema, ruleSchema } from '../../features/email-routing/validation.js';

const VALID_DEST = { destEmail: 'dest@example.com' };

function parseLocalPart(localPart) {
  return ruleSchema.safeParse({ localPart, ...VALID_DEST });
}

test('ruleSchema: acepta alias con letras, números, puntos y guiones', () => {
  for (const localPart of ['alias', 'a', 'a1', 'mi.alias', 'mi-alias', 'mi_alias', 'a.b-c_d1']) {
    assert.equal(parseLocalPart(localPart).success, true, `debería aceptar "${localPart}"`);
  }
});

test('ruleSchema: rechaza alias que no empiezan o acaban en alfanumérico', () => {
  // Todos producen direcciones inválidas que Cloudflare rechaza con un error confuso.
  for (const localPart of ['.', '..', '.alias', 'alias.', '-alias', 'alias-', '_alias', 'alias_']) {
    assert.equal(parseLocalPart(localPart).success, false, `debería rechazar "${localPart}"`);
  }
});

test('ruleSchema: rechaza mayúsculas, espacios y caracteres fuera del juego permitido', () => {
  for (const localPart of ['Alias', 'mi alias', 'ali@s', 'ali+as', 'aliás']) {
    assert.equal(parseLocalPart(localPart).success, false, `debería rechazar "${localPart}"`);
  }
});

test('ruleSchema: rechaza alias vacío o de más de 64 caracteres', () => {
  assert.equal(parseLocalPart('').success, false);
  assert.equal(parseLocalPart('a'.repeat(64)).success, true);
  assert.equal(parseLocalPart('a'.repeat(65)).success, false);
});

test('ruleSchema: exige un destEmail con formato de correo', () => {
  assert.equal(ruleSchema.safeParse({ localPart: 'alias', destEmail: 'no-es-un-correo' }).success, false);
  assert.equal(ruleSchema.safeParse({ localPart: 'alias' }).success, false);
});

test('addressSchema: valida el formato del correo de destino', () => {
  assert.equal(addressSchema.safeParse({ email: 'dest@example.com' }).success, true);
  assert.equal(addressSchema.safeParse({ email: 'dest@' }).success, false);
  assert.equal(addressSchema.safeParse({}).success, false);
});

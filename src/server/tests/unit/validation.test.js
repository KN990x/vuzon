import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressSchema, ruleSchema } from '../../features/email-routing/validation.js';

const VALID_DEST = { destEmail: 'dest@example.com' };

function parseLocalPart(localPart) {
  return ruleSchema.safeParse({ localPart, ...VALID_DEST });
}

test('ruleSchema: accepts aliases with letters, digits, dots and dashes', () => {
  for (const localPart of ['alias', 'a', 'a1', 'mi.alias', 'mi-alias', 'mi_alias', 'a.b-c_d1']) {
    assert.equal(parseLocalPart(localPart).success, true, `should accept "${localPart}"`);
  }
});

test('ruleSchema: rejects aliases not starting or ending alphanumeric', () => {
  // All of these produce invalid addresses that Cloudflare rejects with a confusing error.
  for (const localPart of ['.', '..', '.alias', 'alias.', '-alias', 'alias-', '_alias', 'alias_']) {
    assert.equal(parseLocalPart(localPart).success, false, `should reject "${localPart}"`);
  }
});

test('ruleSchema: rejects uppercase, spaces and characters outside the allowed set', () => {
  for (const localPart of ['Alias', 'mi alias', 'ali@s', 'ali+as', 'aliás']) {
    assert.equal(parseLocalPart(localPart).success, false, `should reject "${localPart}"`);
  }
});

test('ruleSchema: rejects an empty alias or one over 64 characters', () => {
  assert.equal(parseLocalPart('').success, false);
  assert.equal(parseLocalPart('a'.repeat(64)).success, true);
  assert.equal(parseLocalPart('a'.repeat(65)).success, false);
});

test('ruleSchema: requires a destEmail in email format', () => {
  assert.equal(ruleSchema.safeParse({ localPart: 'alias', destEmail: 'no-es-un-correo' }).success, false);
  assert.equal(ruleSchema.safeParse({ localPart: 'alias' }).success, false);
});

test('addressSchema: validates the destination email format', () => {
  assert.equal(addressSchema.safeParse({ email: 'dest@example.com' }).success, true);
  assert.equal(addressSchema.safeParse({ email: 'dest@' }).success, false);
  assert.equal(addressSchema.safeParse({}).success, false);
});

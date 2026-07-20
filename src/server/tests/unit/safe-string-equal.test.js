import assert from 'node:assert/strict';
import { test } from 'node:test';
import { timingSafeStringEqual } from '../../features/auth/safe-string-equal.js';

test('timingSafeStringEqual: iguales', () => {
  assert.equal(timingSafeStringEqual('abc', 'abc'), true);
});

test('timingSafeStringEqual: distintos', () => {
  assert.equal(timingSafeStringEqual('abc', 'abd'), false);
  assert.equal(timingSafeStringEqual('abc', 'ab'), false);
});

test('timingSafeStringEqual: vacíos', () => {
  assert.equal(timingSafeStringEqual('', ''), true);
  assert.equal(timingSafeStringEqual('a', ''), false);
});

test('timingSafeStringEqual: no string', () => {
  assert.equal(timingSafeStringEqual(null, 'a'), false);
  assert.equal(timingSafeStringEqual('a', undefined), false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { timingSafeStringEqual } from '../../features/auth/safe-string-equal.js';

test('timingSafeStringEqual: equal', () => {
  assert.equal(timingSafeStringEqual('abc', 'abc'), true);
});

test('timingSafeStringEqual: different', () => {
  assert.equal(timingSafeStringEqual('abc', 'abd'), false);
  assert.equal(timingSafeStringEqual('abc', 'ab'), false);
});

test('timingSafeStringEqual: empty', () => {
  assert.equal(timingSafeStringEqual('', ''), true);
  assert.equal(timingSafeStringEqual('a', ''), false);
});

test('timingSafeStringEqual: non-string', () => {
  assert.equal(timingSafeStringEqual(null, 'a'), false);
  assert.equal(timingSafeStringEqual('a', undefined), false);
});

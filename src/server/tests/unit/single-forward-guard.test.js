import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSingleForwardRule } from '../../features/email-routing/single-forward-guard.js';

test('isSingleForwardRule: a rule forwarding to one address is editable', () => {
  assert.equal(
    isSingleForwardRule({ actions: [{ type: 'forward', value: ['dest@example.com'] }] }),
    true,
  );
  // Cloudflare has also returned the destination as a bare string.
  assert.equal(
    isSingleForwardRule({ actions: [{ type: 'forward', value: 'dest@example.com' }] }),
    true,
  );
});

test('isSingleForwardRule: Worker, drop and fan-out rules stay read-only', () => {
  assert.equal(isSingleForwardRule({ actions: [{ type: 'worker', value: ['w'] }] }), false);
  assert.equal(isSingleForwardRule({ actions: [{ type: 'drop' }] }), false);
  assert.equal(
    isSingleForwardRule({ actions: [{ type: 'forward', value: ['a@example.com', 'b@example.com'] }] }),
    false,
  );
  assert.equal(
    isSingleForwardRule({
      actions: [
        { type: 'forward', value: ['a@example.com'] },
        { type: 'worker', value: ['w'] },
      ],
    }),
    false,
  );
});

test('isSingleForwardRule: a broken or empty shape is never editable', () => {
  for (const rule of [null, undefined, 'rule', {}, { actions: [] }, { actions: 'forward' }]) {
    assert.equal(isSingleForwardRule(rule), false, JSON.stringify(rule) ?? String(rule));
  }
  assert.equal(isSingleForwardRule({ actions: [{ type: 'forward', value: [''] }] }), false);
  assert.equal(isSingleForwardRule({ actions: [{ type: 'forward', value: [42] }] }), false);
});

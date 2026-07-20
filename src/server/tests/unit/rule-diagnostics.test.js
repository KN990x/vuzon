import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasRuleForAlias,
  inspectDestination,
  isVerifiedAddress,
} from '../../features/email-routing/rule-diagnostics.js';

test('isVerifiedAddress: accepts the shapes Cloudflare has returned', () => {
  assert.equal(isVerifiedAddress(true), true);
  assert.equal(isVerifiedAddress('verified'), true);
  assert.equal(isVerifiedAddress('2024-05-01T10:00:00Z'), true);
  assert.equal(isVerifiedAddress({ status: 'verified' }), true);
  assert.equal(isVerifiedAddress({ verification_status: 'active' }), true);
});

test('isVerifiedAddress: rejects pending values and junk', () => {
  assert.equal(isVerifiedAddress(false), false);
  assert.equal(isVerifiedAddress(null), false);
  assert.equal(isVerifiedAddress(undefined), false);
  assert.equal(isVerifiedAddress('pending'), false);
  assert.equal(isVerifiedAddress({ status: 'pending' }), false);
});

test('inspectDestination: distinguishes unknown, pending and verified', () => {
  const addresses = [
    { email: 'ok@example.com', verified: true },
    { email: 'pendiente@example.com', verified: false },
  ];

  assert.deepEqual(
    inspectDestination(addresses, 'ok@example.com'),
    { exists: true, verified: true },
  );
  assert.deepEqual(
    inspectDestination(addresses, 'pendiente@example.com'),
    { exists: true, verified: false },
  );
  assert.deepEqual(
    inspectDestination(addresses, 'nadie@example.com'),
    { exists: false, verified: false },
  );
});

test('inspectDestination: compares ignoring case and whitespace', () => {
  const addresses = [{ email: 'OK@Example.com ', verified: true }];
  assert.deepEqual(
    inspectDestination(addresses, '  ok@example.COM'),
    { exists: true, verified: true },
  );
});

test('inspectDestination: tolerates a missing or invalid list', () => {
  assert.deepEqual(inspectDestination(null, 'x@y.com'), { exists: false, verified: false });
  assert.deepEqual(inspectDestination([null, {}], 'x@y.com'), { exists: false, verified: false });
});

test('hasRuleForAlias: detects an existing literal matcher', () => {
  const rules = [
    { matchers: [{ type: 'literal', field: 'to', value: 'hola@example.com' }] },
    { matchers: [{ type: 'all' }] },
  ];

  assert.equal(hasRuleForAlias(rules, 'hola@example.com'), true);
  assert.equal(hasRuleForAlias(rules, 'HOLA@example.com'), true);
  assert.equal(hasRuleForAlias(rules, 'otro@example.com'), false);
});

test('hasRuleForAlias: the catch-all does not count as a duplicate', () => {
  const rules = [{ matchers: [{ type: 'all' }] }];
  assert.equal(hasRuleForAlias(rules, 'cualquiera@example.com'), false);
});

test('hasRuleForAlias: tolerates rules without matchers', () => {
  assert.equal(hasRuleForAlias([{}, { matchers: null }, null], 'x@example.com'), false);
  assert.equal(hasRuleForAlias(undefined, 'x@example.com'), false);
});

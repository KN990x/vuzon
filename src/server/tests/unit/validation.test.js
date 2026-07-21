import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addressSchema,
  catchAllUpdateSchema,
  panelActionSchema,
  ruleSchema,
  ruleUpdateSchema,
} from '../../features/email-routing/validation.js';

const VALID_ACTION = { action: { type: 'forward', value: ['dest@example.com'] } };

function parseLocalPart(localPart) {
  return ruleSchema.safeParse({ localPart, ...VALID_ACTION });
}

function firstIssue(result) {
  return result.success ? null : result.error.issues[0].message;
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

test('ruleSchema: rejects consecutive separators', () => {
  for (const localPart of ['a..b', 'a.-b', 'a--b', 'a__.b', 'a._b']) {
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

test('ruleSchema: requires an action', () => {
  assert.equal(ruleSchema.safeParse({ localPart: 'alias' }).success, false);
  assert.equal(ruleSchema.safeParse({ localPart: 'alias', ...VALID_ACTION }).success, true);
  // The pre-action wire format is gone: a bare destEmail is no longer an action.
  assert.equal(
    ruleSchema.safeParse({ localPart: 'alias', destEmail: 'dest@example.com' }).success,
    false,
  );
});

test('ruleSchema: a drop alias needs no destination', () => {
  const parsed = ruleSchema.safeParse({ localPart: 'alias', action: { type: 'drop' } });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data.action, { type: 'drop' });
});

test('panelActionSchema: only forward and drop may be written by the panel', () => {
  // A `worker` action is preserved by omitting `action`, never sent by the client:
  // pointing a rule at a Worker would need a scope the token does not have.
  const worker = panelActionSchema.safeParse({ type: 'worker', value: ['my-worker'] });
  assert.equal(worker.success, false);
  assert.equal(firstIssue(worker), 'action.type');

  assert.equal(firstIssue(panelActionSchema.safeParse({ type: 'nope' })), 'action.type');
  assert.equal(firstIssue(panelActionSchema.safeParse('forward')), 'action.type');
});

test('panelActionSchema: a forward carries exactly one destination', () => {
  const empty = panelActionSchema.safeParse({ type: 'forward', value: [] });
  assert.equal(firstIssue(empty), 'action.forward_single');

  // Fan-out rules keep working, but the panel never manufactures one.
  const fanout = panelActionSchema.safeParse({
    type: 'forward',
    value: ['a@example.com', 'b@example.com'],
  });
  assert.equal(firstIssue(fanout), 'action.forward_single');

  const invalid = panelActionSchema.safeParse({ type: 'forward', value: ['not-an-email'] });
  assert.equal(firstIssue(invalid), 'dest_email.invalid');

  const parsed = panelActionSchema.safeParse({ type: 'forward', value: ['  dest@example.com  '] });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data.value, ['dest@example.com']);
});

test('ruleUpdateSchema: every field is optional but the patch cannot be empty', () => {
  assert.equal(ruleUpdateSchema.safeParse({ enabled: false }).success, true);
  assert.equal(ruleUpdateSchema.safeParse({ name: 'Newsletters' }).success, true);
  assert.equal(ruleUpdateSchema.safeParse(VALID_ACTION).success, true);
  assert.equal(firstIssue(ruleUpdateSchema.safeParse({})), 'rule_update.empty');
});

test('ruleUpdateSchema: bounds the rule name', () => {
  assert.equal(firstIssue(ruleUpdateSchema.safeParse({ name: '   ' })), 'rule_name.empty');
  assert.equal(ruleUpdateSchema.safeParse({ name: 'a'.repeat(255) }).success, true);
  assert.equal(firstIssue(ruleUpdateSchema.safeParse({ name: 'a'.repeat(256) })), 'rule_name.too_long');

  const parsed = ruleUpdateSchema.safeParse({ name: '  Newsletters  ' });
  assert.equal(parsed.data.name, 'Newsletters');
});

test('catchAllUpdateSchema: takes an action and enabled, never matchers or a name', () => {
  assert.equal(catchAllUpdateSchema.safeParse({ enabled: true }).success, true);
  assert.equal(catchAllUpdateSchema.safeParse({ action: { type: 'drop' } }).success, true);
  assert.equal(firstIssue(catchAllUpdateSchema.safeParse({})), 'rule_update.empty');

  // The matcher is forced by the route; anything sent for it is dropped, never honoured.
  const parsed = catchAllUpdateSchema.safeParse({
    enabled: true,
    matchers: [{ type: 'literal', field: 'to', value: 'sneaky@example.com' }],
    name: 'renamed',
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(Object.keys(parsed.data), ['enabled']);
});

test('addressSchema: validates the destination email format', () => {
  assert.equal(addressSchema.safeParse({ email: 'dest@example.com' }).success, true);
  assert.equal(addressSchema.safeParse({ email: 'dest@' }).success, false);
  assert.equal(addressSchema.safeParse({}).success, false);
});

test('addressSchema: trims email whitespace', () => {
  const addressParsed = addressSchema.safeParse({ email: '  dest@example.com  ' });
  assert.equal(addressParsed.success, true);
  assert.equal(addressParsed.data.email, 'dest@example.com');
});

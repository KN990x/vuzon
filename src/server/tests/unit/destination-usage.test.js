import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  destinationInUseError,
  findRulesUsingDestination,
  ruleAliasLabel,
} from '../../features/email-routing/destination-usage.js';
import { ERROR_CODES } from '../../platform/http/error-codes.js';

test('findRulesUsingDestination: scalar and array forward values', () => {
  const rules = [
    {
      id: 'r1',
      matchers: [{ type: 'literal', field: 'to', value: 'a@example.com' }],
      actions: [{ type: 'forward', value: 'Dest@Example.com' }],
    },
    {
      id: 'r2',
      matchers: [{ type: 'literal', field: 'to', value: 'b@example.com' }],
      actions: [{ type: 'forward', value: ['other@example.com', 'dest@example.com'] }],
    },
    {
      id: 'r3',
      matchers: [{ type: 'literal', field: 'to', value: 'c@example.com' }],
      actions: [{ type: 'forward', value: ['other@example.com'] }],
    },
  ];

  const found = findRulesUsingDestination(rules, '  DEST@example.com  ');
  assert.equal(found.length, 2);
  assert.equal(found[0].id, 'r1');
  assert.equal(found[1].id, 'r2');
});

test('findRulesUsingDestination: worker and drop rules without forward are ignored', () => {
  const rules = [
    { id: 'w', actions: [{ type: 'worker', value: ['my-worker'] }] },
    { id: 'd', actions: [{ type: 'drop' }] },
    {
      id: 'mixed',
      matchers: [{ type: 'literal', field: 'to', value: 'x@example.com' }],
      actions: [
        { type: 'worker', value: ['w'] },
        { type: 'forward', value: ['dest@example.com'] },
      ],
    },
  ];

  const found = findRulesUsingDestination(rules, 'dest@example.com');
  assert.equal(found.length, 1);
  assert.equal(found[0].id, 'mixed');
});

test('findRulesUsingDestination: catch-all matcher is detected', () => {
  const rules = [{
    id: 'catch_all_rule',
    matchers: [{ type: 'all' }],
    actions: [{ type: 'forward', value: ['dest@example.com'] }],
  }];

  const found = findRulesUsingDestination(rules, 'dest@example.com');
  assert.equal(found.length, 1);
  assert.equal(ruleAliasLabel(found[0]), 'catch-all');
});

test('ruleAliasLabel: prefers literal to, then name, then id', () => {
  assert.equal(
    ruleAliasLabel({
      id: 'r',
      name: 'ignored',
      matchers: [{ type: 'literal', field: 'to', value: 'alias@example.com' }],
    }),
    'alias@example.com',
  );
  assert.equal(ruleAliasLabel({ id: 'r', name: 'My rule', matchers: [] }), 'My rule');
  assert.equal(ruleAliasLabel({ id: 'rule-42' }), 'rule-42');
});

test('destinationInUseError: joins aliases into a string param', () => {
  const err = destinationInUseError('dest@example.com', ['a@example.com', 'catch-all']);
  assert.equal(err.code, ERROR_CODES.DEST_IN_USE);
  assert.equal(err.status, 400);
  assert.equal(err.params.email, 'dest@example.com');
  assert.equal(err.params.aliases, 'a@example.com, catch-all');
  assert.match(err.message, /dest@example.com/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isCatchAllRule,
  isCatchAllRuleId,
} from '../../features/email-routing/catch-all-guard.js';

test('isCatchAllRuleId: catch_all only', () => {
  assert.equal(isCatchAllRuleId('catch_all'), true);
  assert.equal(isCatchAllRuleId('catch_all_rule'), false);
  assert.equal(isCatchAllRuleId('rule1'), false);
});

test('isCatchAllRule: by id or by matcher type all', () => {
  assert.equal(isCatchAllRule({ id: 'catch_all', matchers: [] }), true);
  assert.equal(isCatchAllRule({
    id: 'abc',
    matchers: [{ type: 'all' }],
  }), true);
  assert.equal(isCatchAllRule({
    id: 'rule1',
    matchers: [{ type: 'literal', field: 'to', value: 'a@b.com' }],
  }), false);
  assert.equal(isCatchAllRule(null), false);
});

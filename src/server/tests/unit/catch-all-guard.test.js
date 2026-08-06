import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isCatchAllRule,
  isCatchAllRuleId,
} from '../../features/email-routing/catch-all-guard.js';

test('isCatchAllRuleId: both the Cloudflare slug and the panel\'s own URL segment, any case', () => {
  assert.equal(isCatchAllRuleId('catch_all'), true);

  // The hyphenated form is the branch that matters, and nothing exercised it: it is the
  // panel's OWN url (`PUT /api/rules/catch-all`), and `cloudflareResourceIdSchema` accepts
  // hyphens, so if the dedicated route were ever registered after `/api/rules/:id` the
  // request would fall through to the parametrised handler. The old test was even named
  // "catch_all only", which invited deleting the clause as dead code.
  assert.equal(isCatchAllRuleId('catch-all'), true);

  // Case-folded: the schema accepts uppercase, and letting `CATCH_ALL` through meant the
  // guard delegated its own decision to Cloudflare's path matching.
  assert.equal(isCatchAllRuleId('CATCH_ALL'), true);
  assert.equal(isCatchAllRuleId('Catch-All'), true);

  assert.equal(isCatchAllRuleId('catch_all_rule'), false);
  assert.equal(isCatchAllRuleId('rule1'), false);
  // Non-strings must not throw: the value comes from the URL.
  assert.equal(isCatchAllRuleId(undefined), false);
  assert.equal(isCatchAllRuleId(null), false);
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

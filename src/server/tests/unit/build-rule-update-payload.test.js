import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRuleUpdatePayload } from '../../features/email-routing/routes.js';

test('buildRuleUpdatePayload: basic API alias without source', () => {
  const payload = buildRuleUpdatePayload(
    {
      name: 'a@example.com',
      matchers: [{ type: 'literal', field: 'to', value: 'a@example.com' }],
      actions: [{ type: 'forward', value: ['d@x.com'] }],
      priority: 10,
    },
    false,
  );
  assert.deepEqual(payload, {
    name: 'a@example.com',
    enabled: false,
    matchers: [{ type: 'literal', field: 'to', value: 'a@example.com' }],
    actions: [{ type: 'forward', value: ['d@x.com'] }],
    priority: 10,
  });
});

test('buildRuleUpdatePayload: preserves source and owner_worker_tag from wrangler rules', () => {
  const payload = buildRuleUpdatePayload(
    {
      name: 'worker-route',
      matchers: [{ type: 'literal', field: 'to', value: 'w@example.com' }],
      actions: [{ type: 'worker', value: ['email-worker'] }],
      source: 'wrangler',
      owner_worker_tag: 'tag_abc123',
    },
    true,
  );
  assert.equal(payload.source, 'wrangler');
  assert.equal(payload.owner_worker_tag, 'tag_abc123');
  assert.equal(payload.enabled, true);
});

test('buildRuleUpdatePayload: preserves unknown passthrough fields on enable/disable', () => {
  const payload = buildRuleUpdatePayload(
    {
      id: 'rule_abc',
      tag: 'tag_xyz',
      created_on: '2024-01-01T00:00:00Z',
      modified_on: '2024-06-01T00:00:00Z',
      name: 'a@example.com',
      matchers: [{ type: 'literal', field: 'to', value: 'a@example.com' }],
      actions: [{ type: 'forward', value: ['d@x.com'] }],
      some_future_field: 'keep-me',
    },
    false,
  );

  assert.equal(payload.some_future_field, 'keep-me');
  assert.equal(payload.enabled, false);
  assert.equal('id' in payload, false);
  assert.equal('tag' in payload, false);
  assert.equal('created_on' in payload, false);
  assert.equal('modified_on' in payload, false);
});

test('buildRuleUpdatePayload: overrides.actions replaces the rule actions', () => {
  const payload = buildRuleUpdatePayload(
    {
      name: 'a@example.com',
      matchers: [{ type: 'literal', field: 'to', value: 'a@example.com' }],
      actions: [{ type: 'forward', value: ['old@x.com'] }],
    },
    true,
    { actions: [{ type: 'forward', value: ['new@x.com'] }] },
  );

  assert.deepEqual(payload.actions, [{ type: 'forward', value: ['new@x.com'] }]);
});

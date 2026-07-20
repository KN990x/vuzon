import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRuleUpdatePayload } from '../../features/email-routing/routes.js';

test('buildRuleUpdatePayload: alias API básico sin source', () => {
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

test('buildRuleUpdatePayload: preserva source y owner_worker_tag de reglas wrangler', () => {
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

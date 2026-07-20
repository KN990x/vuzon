import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cloudflareResourceIdSchema } from '../../shared/cloudflare-schemas.js';

test('cloudflareResourceIdSchema: accepts a typical ID', () => {
  const r = cloudflareResourceIdSchema.safeParse('zone_test_1');
  assert.equal(r.success, true);
});

test('cloudflareResourceIdSchema: rejects disallowed characters', () => {
  const r = cloudflareResourceIdSchema.safeParse('bad id');
  assert.equal(r.success, false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { resolveApiRouteError } from '../../platform/http/api-route-error.js';
import { CloudflareApiError } from '../../platform/cloudflare/client.js';

test('resolveApiRouteError: ZodError → 400 and a formatted message', () => {
  const parsed = z.string().email().safeParse('no-es-email');
  assert.ok(!parsed.success);
  const { status, message } = resolveApiRouteError(parsed.error);
  assert.equal(status, 400);
  assert.ok(message.length > 0);
});

test('resolveApiRouteError: Cloudflare 401 → 502 and a generic message', () => {
  const err = new CloudflareApiError('upstream secret', { status: 401, code: 'x' });
  const { status, message } = resolveApiRouteError(err);
  assert.equal(status, 502);
  assert.ok(!message.includes('upstream'));
});

test('resolveApiRouteError: Cloudflare 404 keeps 404 and a generic message', () => {
  const err = new CloudflareApiError('not found', { status: 404, code: 'y' });
  const { status, message } = resolveApiRouteError(err);
  assert.equal(status, 404);
  assert.ok(!message.includes('not found'));
});

test('resolveApiRouteError: a generic Error → 500', () => {
  const { status, message } = resolveApiRouteError(new Error('oops'));
  assert.equal(status, 500);
  assert.equal(message, 'Error interno del servidor');
});

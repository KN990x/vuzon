import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { resolveApiRouteError } from '../../platform/http/api-route-error.js';
import { ERROR_CODES } from '../../platform/http/error-codes.js';
import { PanelRequestError } from '../../platform/http/panel-request-error.js';
import { CloudflareApiError } from '../../platform/cloudflare/client.js';

test('resolveApiRouteError: ZodError → 400, code and the issue slugs', () => {
  const parsed = z.object({ email: z.string().email('email.invalid') })
    .safeParse({ email: 'not-an-email' });
  assert.ok(!parsed.success);
  const { status, message, code, params } = resolveApiRouteError(parsed.error);
  assert.equal(status, 400);
  assert.ok(message.length > 0);
  assert.equal(code, ERROR_CODES.VALIDATION_INVALID);
  assert.deepEqual(params, { issues: [{ field: 'email', code: 'email.invalid' }] });
});

test('resolveApiRouteError: PanelRequestError keeps its code and params', () => {
  const err = new PanelRequestError('The alias x@example.com already exists.', {
    code: ERROR_CODES.RULES_DUPLICATE_ALIAS,
    params: { alias: 'x@example.com' },
  });
  const { status, message, code, params } = resolveApiRouteError(err);
  assert.equal(status, 400);
  assert.equal(message, 'The alias x@example.com already exists.');
  assert.equal(code, ERROR_CODES.RULES_DUPLICATE_ALIAS);
  assert.deepEqual(params, { alias: 'x@example.com' });
});

test('resolveApiRouteError: Cloudflare 401 → 502 and a generic message', () => {
  const err = new CloudflareApiError('upstream secret', { status: 401, code: 'x' });
  const { status, message, code } = resolveApiRouteError(err);
  assert.equal(status, 502);
  assert.ok(!message.includes('upstream'));
  assert.equal(code, ERROR_CODES.CLOUDFLARE_GENERIC);
});

test('resolveApiRouteError: Cloudflare 404 keeps 404 and a generic message', () => {
  const err = new CloudflareApiError('not found', { status: 404, code: 'y' });
  const { status, message, code } = resolveApiRouteError(err);
  assert.equal(status, 404);
  assert.ok(!message.includes('not found'));
  assert.equal(code, ERROR_CODES.CLOUDFLARE_GENERIC);
});

test('resolveApiRouteError: a generic Error → 500', () => {
  const { status, message, code } = resolveApiRouteError(new Error('oops'));
  assert.equal(status, 500);
  assert.equal(message, 'Internal server error');
  assert.equal(code, ERROR_CODES.SERVER_INTERNAL);
});

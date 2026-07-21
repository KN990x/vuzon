import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CloudflareApiError, createCloudflareClient } from '../../platform/cloudflare/client.js';

const realFetch = globalThis.fetch;
const ENV = { CF_API_TOKEN: 'token-de-prueba' };

afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Minimal response with the surface parseCloudflareResponse uses:
 * headers.get('content-type'), ok, status, json() and text().
 */
function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(text, { status = 200, contentType = 'text/html' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => {
      throw new Error('not JSON');
    },
    text: async () => text,
  };
}

/** Replaces fetch with a queue of responses/errors and records the calls. */
function stubFetch(queue) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const next = typeof queue === 'function' ? queue(calls.length - 1) : queue[calls.length - 1];
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  return calls;
}

function abortError() {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

test('headers: sends the token as Bearer and Content-Type JSON', async () => {
  const calls = stubFetch([jsonResponse({ success: true, result: { id: 'x' } })]);
  const client = createCloudflareClient({ env: ENV });

  await client.fetchCloudflare('/zones/z/email/routing/rules/r');

  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/zones/z/email/routing/rules/r');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-de-prueba');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
});

test('fetchCloudflare: returns only `result` from the Cloudflare envelope', async () => {
  stubFetch([jsonResponse({ success: true, result: { id: 'rule1' }, errors: [] })]);
  const client = createCloudflareClient({ env: ENV });

  assert.deepEqual(await client.fetchCloudflare('/zones/z/email/routing/rules/rule1'), { id: 'rule1' });
});

test('retries GETs on transient statuses and ends up returning the result', async () => {
  const calls = stubFetch([
    jsonResponse({ success: false, errors: [{ message: 'rate limited', code: 10000 }] }, { status: 429 }),
    jsonResponse({ success: false, errors: [{ message: 'bad gateway' }] }, { status: 502 }),
    jsonResponse({ success: true, result: [] }),
  ]);
  const client = createCloudflareClient({ env: ENV });

  assert.deepEqual(await client.fetchCloudflare('/zones/z/email/routing/rules/r'), []);
  assert.equal(calls.length, 3);
});

test('exhausts GET retries after 3 calls (MAX_GET_RETRIES = 2)', async () => {
  const calls = stubFetch(() => jsonResponse({ success: false, errors: [{ message: 'boom' }] }, { status: 500 }));
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchCloudflare('/zones/z/email/routing/rules/r'),
    (err) => err instanceof CloudflareApiError && err.status === 500,
  );
  assert.equal(calls.length, 3);
});

test('does not retry mutations: POST fails immediately', async () => {
  const calls = stubFetch(() => jsonResponse({ success: false, errors: [{ message: 'boom' }] }, { status: 500 }));
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(() => client.fetchCloudflare('/zones/z/email/routing/rules', 'POST', { a: 1 }));
  assert.equal(calls.length, 1);
});

test('does not retry non-transient statuses: a 400 on GET fails immediately', async () => {
  const calls = stubFetch(() => jsonResponse({ success: false, errors: [{ message: 'nope' }] }, { status: 400 }));
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(() => client.fetchCloudflare('/zones/z/email/routing/rules/r'));
  assert.equal(calls.length, 1);
});

test('timeout: AbortError is normalized to 504 upstream_timeout', async () => {
  stubFetch(() => abortError());
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchCloudflare('/zones/z/email/routing/rules', 'POST', { a: 1 }),
    (err) => {
      assert.ok(err instanceof CloudflareApiError);
      assert.equal(err.status, 504);
      assert.equal(err.code, 'upstream_timeout');
      return true;
    },
  );
});

test('network down: any other transport failure is normalized to 502 upstream_unreachable', async () => {
  stubFetch(() => new TypeError('fetch failed'));
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchCloudflare('/zones/z/email/routing/rules', 'POST', { a: 1 }),
    (err) => {
      assert.ok(err instanceof CloudflareApiError);
      assert.equal(err.status, 502);
      assert.equal(err.code, 'upstream_unreachable');
      return true;
    },
  );
});

test('a non-JSON response (e.g. HTML from a proxy) yields invalid_response', async () => {
  stubFetch(() => textResponse('<html>502 Bad Gateway</html>', { status: 200 }));
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchCloudflare('/zones/z/email/routing/rules', 'POST', { a: 1 }),
    (err) => {
      assert.ok(err instanceof CloudflareApiError);
      assert.equal(err.code, 'invalid_response');
      return true;
    },
  );
});

test('HTTP 200 with success:false is treated as an error, not a success', async () => {
  stubFetch(() => jsonResponse({ success: false, errors: [{ message: 'Invalid zone', code: 1001 }] }));
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchCloudflare('/zones/z/email/routing/rules', 'POST', { a: 1 }),
    (err) => {
      assert.ok(err instanceof CloudflareApiError);
      assert.equal(err.message, 'Invalid zone');
      assert.equal(err.code, 1001);
      return true;
    },
  );
});

test('the error details never include the token', async () => {
  stubFetch(() => jsonResponse({ success: false, errors: [{ message: 'nope' }] }, { status: 400 }));
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchCloudflare('/zones/z/email/routing/rules', 'POST', { a: 1 }),
    (err) => {
      assert.equal(JSON.stringify(err.details).includes(ENV.CF_API_TOKEN), false);
      return true;
    },
  );
});

test('fetchAllCloudflare: concatenates pages following result_info.total_pages', async () => {
  const calls = stubFetch([
    jsonResponse({ success: true, result: [{ id: 'a' }], result_info: { total_pages: 3 } }),
    jsonResponse({ success: true, result: [{ id: 'b' }], result_info: { total_pages: 3 } }),
    jsonResponse({ success: true, result: [{ id: 'c' }], result_info: { total_pages: 3 } }),
  ]);
  const client = createCloudflareClient({ env: ENV });

  const all = await client.fetchAllCloudflare('/accounts/a/email/routing/addresses');

  assert.deepEqual(all, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /\?page=1&per_page=50$/);
  assert.match(calls[2].url, /\?page=3&per_page=50$/);
});

test('fetchAllCloudflare: uses & as separator when the path already has a query', async () => {
  const calls = stubFetch([jsonResponse({ success: true, result: [] })]);
  const client = createCloudflareClient({ env: ENV });

  await client.fetchAllCloudflare('/zones?name=example.com');

  assert.match(calls[0].url, /\/zones\?name=example\.com&page=1&per_page=50$/);
});

test('fetchAllCloudflare: without result_info it stays on a single page', async () => {
  const calls = stubFetch([jsonResponse({ success: true, result: [{ id: 'a' }] })]);
  const client = createCloudflareClient({ env: ENV });

  assert.deepEqual(await client.fetchAllCloudflare('/zones/z/email/routing/rules'), [{ id: 'a' }]);
  assert.equal(calls.length, 1);
});

test('fetchAllCloudflare: a full page without total_pages keeps paginating', async () => {
  // Missing/malformed total_pages used to stop at page 1. A full page (per_page=50) is
  // the signal that there may be more — keep walking until a short page.
  const fullPage = Array.from({ length: 50 }, (_, i) => ({ id: `p1-${i}` }));
  const calls = stubFetch([
    jsonResponse({ success: true, result: fullPage }),
    jsonResponse({ success: true, result: [{ id: 'p2-0' }] }),
  ]);
  const client = createCloudflareClient({ env: ENV });

  const all = await client.fetchAllCloudflare('/zones/z/email/routing/rules');
  assert.equal(all.length, 51);
  assert.equal(calls.length, 2);
});

test('fetchAllCloudflare: stops when the page cap is exceeded', async () => {
  const calls = stubFetch(() =>
    jsonResponse({ success: true, result: [{ id: 'x' }], result_info: { total_pages: 999 } }),
  );
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchAllCloudflare('/zones/z/email/routing/rules'),
    (err) => {
      assert.ok(err instanceof CloudflareApiError);
      assert.equal(err.code, 'list_pagination_limit');
      return true;
    },
  );
  // 100 pages read; the 101st is rejected before calling fetch.
  assert.equal(calls.length, 100);
});

test('fetchAllCloudflare: stops when the item cap is exceeded', async () => {
  const page = Array.from({ length: 5001 }, (_, i) => ({ id: `item-${i}` }));
  stubFetch(() => jsonResponse({ success: true, result: page, result_info: { total_pages: 2 } }));
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchAllCloudflare('/zones/z/email/routing/rules'),
    (err) => {
      assert.ok(err instanceof CloudflareApiError);
      assert.equal(err.code, 'list_items_limit');
      return true;
    },
  );
});

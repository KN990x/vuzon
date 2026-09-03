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

test('GET retries a timeout, then reports 504', async () => {
  const calls = stubFetch(() => abortError());
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchCloudflare('/zones/z/email/routing/rules'),
    (err) => {
      assert.ok(err instanceof CloudflareApiError);
      assert.equal(err.status, 504);
      assert.equal(err.code, 'upstream_timeout');
      return true;
    },
  );
  assert.equal(calls.length, 3);
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

test('GET retries a transport failure, then reports 502', async () => {
  const calls = stubFetch(() => new TypeError('fetch failed'));
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchCloudflare('/zones/z/email/routing/rules'),
    (err) => {
      assert.ok(err instanceof CloudflareApiError);
      assert.equal(err.status, 502);
      assert.equal(err.code, 'upstream_unreachable');
      return true;
    },
  );
  assert.equal(calls.length, 3);
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
      // The status must land in the 4xx band. Carrying `res.status` verbatim gave the
      // error a status of 200, and the caller's "is this a client error?" test
      // (`status >= 400 && status < 500`) was false — so rule-diagnostics never ran and a
      // duplicate alias came back as the generic Cloudflare message.
      assert.equal(err.status, 400);
      assert.equal(err.retryable, false);
      return true;
    },
  );
});

test('a 2xx envelope rejection is diagnosable as a client error', async () => {
  // 204 and 201 travel the same path as 200; none of them may leak through as "not a
  // client error" just because the HTTP layer was happy.
  for (const status of [200, 201, 204]) {
    stubFetch(() => jsonResponse(
      { success: false, errors: [{ message: 'duplicate', code: 5009 }] },
      { status },
    ));
    const client = createCloudflareClient({ env: ENV });

    await assert.rejects(
      () => client.fetchCloudflare('/zones/z/email/routing/rules', 'POST', { a: 1 }),
      (err) => {
        assert.ok(err.status >= 400 && err.status < 500, `HTTP ${status} produced ${err.status}`);
        return true;
      },
    );
  }
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

test('fetchAllCloudflare: a listing of exactly 5000 items is accepted', async () => {
  // 100 pages × 50 is exactly the item ceiling. Compared with `>` so that complete
  // listing succeeds; the page cap is what stops a 101st request.
  const page = Array.from({ length: 5000 }, (_, i) => ({ id: `item-${i}` }));
  stubFetch(() => jsonResponse({ success: true, result: page, result_info: { total_pages: 1 } }));
  const client = createCloudflareClient({ env: ENV });

  const all = await client.fetchAllCloudflare('/zones/z/email/routing/rules');
  assert.equal(all.length, 5000);
});

test('a 204 No Content on DELETE is a success, not a 502', async () => {
  // parseCloudflareResponse only parses JSON when the content-type announces it, so an
  // empty 2xx used to fall through to buildResponseError and come back as a 502
  // `invalid_response` — the panel reporting failure for a DELETE that had already gone
  // through, leaving the row on screen and the user retrying into a 404.
  stubFetch([textResponse('', { status: 204, contentType: null })]);
  const client = createCloudflareClient({ env: ENV });

  const result = await client.fetchCloudflare('/accounts/a/email/routing/addresses/x', 'DELETE');
  assert.equal(result, null, 'no body means no result, and that is not an error');
});

test('an empty 200 with no JSON content-type is a success too', async () => {
  stubFetch([textResponse('', { status: 200, contentType: 'text/plain' })]);
  const client = createCloudflareClient({ env: ENV });

  assert.equal(await client.fetchCloudflare('/zones/z/email/routing/rules/r', 'DELETE'), null);
});

test('a GET 204 is an invalid response, not an empty listing', async () => {
  stubFetch([textResponse('', { status: 204, contentType: null })]);
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchAllCloudflare('/zones/z/email/routing/rules'),
    (err) => err instanceof CloudflareApiError && err.code === 'invalid_response',
  );
});

test('an empty GET 200 with no JSON is an invalid response, not an empty listing', async () => {
  stubFetch([textResponse('', { status: 200, contentType: 'text/plain' })]);
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchAllCloudflare('/zones/z/email/routing/rules'),
    (err) => err instanceof CloudflareApiError && err.code === 'invalid_response',
  );
});

test('fetchAllCloudflare: result null is not an empty listing', async () => {
  stubFetch([jsonResponse({ success: true, result: null })]);
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchAllCloudflare('/zones/z/email/routing/rules'),
    (err) => err instanceof CloudflareApiError && err.code === 'invalid_response',
  );
});

test('fetchAllCloudflare: a non-array result is not an empty listing', async () => {
  stubFetch([jsonResponse({ success: true, result: { id: 'not-a-list' } })]);
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchAllCloudflare('/zones/z/email/routing/rules'),
    (err) => err instanceof CloudflareApiError && err.code === 'invalid_response',
  );
});

test('fetchAllCloudflare: an empty array is a legitimate empty listing', async () => {
  stubFetch([jsonResponse({ success: true, result: [] })]);
  const client = createCloudflareClient({ env: ENV });

  assert.deepEqual(await client.fetchAllCloudflare('/zones/z/email/routing/rules'), []);
});

test('a non-empty non-JSON 200 is still an invalid response', async () => {
  // The 204 short-circuit must not swallow "200 OK <html>Service Unavailable</html>" from
  // a captive portal or a proxy: that is genuinely not a Cloudflare answer.
  stubFetch([textResponse('<html>nope</html>', { status: 200 })]);
  const client = createCloudflareClient({ env: ENV });

  await assert.rejects(
    () => client.fetchCloudflare('/zones/z/email/routing/rules'),
    (err) => err instanceof CloudflareApiError && err.code === 'invalid_response',
  );
});

test('Retry-After is honoured over the linear backoff, and capped', async () => {
  const retryAfter = (seconds) => ({
    ok: false,
    status: 429,
    headers: {
      get: (name) => {
        const key = name.toLowerCase();
        if (key === 'content-type') return 'application/json';
        if (key === 'retry-after') return String(seconds);
        return null;
      },
    },
    json: async () => ({ success: false, errors: [{ code: 1, message: 'slow down' }] }),
    text: async () => '{}',
  });

  // 1s > the 200ms first backoff, so the header wins; it is also below the 5s cap, so the
  // whole retry chain still finishes well inside the request budget.
  const started = Date.now();
  stubFetch([retryAfter(1), jsonResponse({ success: true, result: [] })]);
  const client = createCloudflareClient({ env: ENV });

  await client.fetchCloudflare('/zones/z/email/routing/rules');
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 900, `expected to wait for Retry-After, waited ${elapsed}ms`);
  assert.ok(elapsed < 5_000, `expected the cap to bound the wait, waited ${elapsed}ms`);
});

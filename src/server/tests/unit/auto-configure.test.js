import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureCloudflareIdentifiers } from '../../platform/cloudflare/auto-configure.js';

const BASE_ENV = { DOMAIN: 'example.com', CF_API_TOKEN: 'tok' };

/** Client returning `zones` for /zones?name=… while recording the calls. */
function createZoneClient(zones) {
  const calls = [];
  return {
    calls,
    async fetchCloudflare(requestPath) {
      calls.push(requestPath);
      return zones;
    },
  };
}

test('auto-configure: with both IDs set it does not call Cloudflare', async () => {
  const env = { ...BASE_ENV, CF_ZONE_ID: 'zone1', CF_ACCOUNT_ID: 'acct1' };
  const cloudflareClient = createZoneClient([]);

  await ensureCloudflareIdentifiers({ env, cloudflareClient });

  assert.deepEqual(cloudflareClient.calls, []);
  assert.equal(env.CF_ZONE_ID, 'zone1');
});

test('auto-configure: detects zone and account from DOMAIN', async () => {
  const env = { ...BASE_ENV };
  const cloudflareClient = createZoneClient([
    { id: 'zone-detectada', account: { id: 'acct-detectada' } },
  ]);

  await ensureCloudflareIdentifiers({ env, cloudflareClient });

  assert.equal(env.CF_ZONE_ID, 'zone-detectada');
  assert.equal(env.CF_ACCOUNT_ID, 'acct-detectada');
  assert.equal(cloudflareClient.calls[0], '/zones?name=example.com');
});

test('auto-configure: the domain is encoded in the query', async () => {
  const env = { ...BASE_ENV, DOMAIN: 'mi dominio.com' };
  const cloudflareClient = createZoneClient([{ id: 'z', account: { id: 'a' } }]);

  await ensureCloudflareIdentifiers({ env, cloudflareClient });

  assert.equal(cloudflareClient.calls[0], '/zones?name=mi%20dominio.com');
});

test('auto-configure: with no zones it explains the token may belong to another account', async () => {
  await assert.rejects(
    () => ensureCloudflareIdentifiers({
      env: { ...BASE_ENV },
      cloudflareClient: createZoneClient([]),
    }),
    /There is no "example\.com" zone/,
  );
});

test('auto-configure: several zones with the same name require setting the IDs by hand', async () => {
  await assert.rejects(
    () => ensureCloudflareIdentifiers({
      env: { ...BASE_ENV },
      cloudflareClient: createZoneClient([
        { id: 'z1', account: { id: 'a1' } },
        { id: 'z2', account: { id: 'a2' } },
      ]),
    }),
    /CF_ZONE_ID and CF_ACCOUNT_ID manually/,
  );
});

test('auto-configure: a zone without account.id is rejected instead of leaving env half-set', async () => {
  const env = { ...BASE_ENV };

  await assert.rejects(
    () => ensureCloudflareIdentifiers({
      env,
      cloudflareClient: createZoneClient([{ id: 'z1' }]),
    }),
    /no zone or account identifiers/,
  );
  assert.equal(env.CF_ZONE_ID, undefined);
  assert.equal(env.CF_ACCOUNT_ID, undefined);
});

test('auto-configure: a non-array response is rejected', async () => {
  await assert.rejects(
    () => ensureCloudflareIdentifiers({
      env: { ...BASE_ENV },
      cloudflareClient: createZoneClient(null),
    }),
    /There is no .* zone/,
  );
});

test('auto-configure: missing DOMAIN or CF_API_TOKEN before calling Cloudflare', async () => {
  const cloudflareClient = createZoneClient([]);

  await assert.rejects(
    () => ensureCloudflareIdentifiers({ env: { CF_API_TOKEN: 'tok' }, cloudflareClient }),
    /DOMAIN or CF_API_TOKEN missing/,
  );
  await assert.rejects(
    () => ensureCloudflareIdentifiers({ env: { DOMAIN: 'example.com' }, cloudflareClient }),
    /DOMAIN or CF_API_TOKEN missing/,
  );
  assert.deepEqual(cloudflareClient.calls, [], 'Cloudflare must not be called without configuration');
});

test('auto-configure: with only one of the two IDs it still auto-detects', async () => {
  const env = { ...BASE_ENV, CF_ZONE_ID: 'zone-manual' };
  const cloudflareClient = createZoneClient([{ id: 'zone-detectada', account: { id: 'acct1' } }]);

  await ensureCloudflareIdentifiers({ env, cloudflareClient });

  assert.equal(cloudflareClient.calls.length, 1);
  assert.equal(env.CF_ACCOUNT_ID, 'acct1');
});

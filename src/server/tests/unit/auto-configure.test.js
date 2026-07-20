import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureCloudflareIdentifiers } from '../../platform/cloudflare/auto-configure.js';

const BASE_ENV = { DOMAIN: 'example.com', CF_API_TOKEN: 'tok' };

/** Cliente que devuelve `zones` para /zones?name=… y registra las llamadas. */
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

test('auto-configure: con ambos IDs definidos no llama a Cloudflare', async () => {
  const env = { ...BASE_ENV, CF_ZONE_ID: 'zone1', CF_ACCOUNT_ID: 'acct1' };
  const cloudflareClient = createZoneClient([]);

  await ensureCloudflareIdentifiers({ env, cloudflareClient });

  assert.deepEqual(cloudflareClient.calls, []);
  assert.equal(env.CF_ZONE_ID, 'zone1');
});

test('auto-configure: detecta zona y cuenta a partir de DOMAIN', async () => {
  const env = { ...BASE_ENV };
  const cloudflareClient = createZoneClient([
    { id: 'zone-detectada', account: { id: 'acct-detectada' } },
  ]);

  await ensureCloudflareIdentifiers({ env, cloudflareClient });

  assert.equal(env.CF_ZONE_ID, 'zone-detectada');
  assert.equal(env.CF_ACCOUNT_ID, 'acct-detectada');
  assert.equal(cloudflareClient.calls[0], '/zones?name=example.com');
});

test('auto-configure: el dominio se codifica en la query', async () => {
  const env = { ...BASE_ENV, DOMAIN: 'mi dominio.com' };
  const cloudflareClient = createZoneClient([{ id: 'z', account: { id: 'a' } }]);

  await ensureCloudflareIdentifiers({ env, cloudflareClient });

  assert.equal(cloudflareClient.calls[0], '/zones?name=mi%20dominio.com');
});

test('auto-configure: sin zonas explica que el token puede ser de otra cuenta', async () => {
  await assert.rejects(
    () => ensureCloudflareIdentifiers({
      env: { ...BASE_ENV },
      cloudflareClient: createZoneClient([]),
    }),
    /No hay ninguna zona "example\.com"/,
  );
});

test('auto-configure: varias zonas con el mismo nombre exigen definir los IDs a mano', async () => {
  await assert.rejects(
    () => ensureCloudflareIdentifiers({
      env: { ...BASE_ENV },
      cloudflareClient: createZoneClient([
        { id: 'z1', account: { id: 'a1' } },
        { id: 'z2', account: { id: 'a2' } },
      ]),
    }),
    /CF_ZONE_ID y CF_ACCOUNT_ID manualmente/,
  );
});

test('auto-configure: zona sin account.id se rechaza en vez de dejar env a medias', async () => {
  const env = { ...BASE_ENV };

  await assert.rejects(
    () => ensureCloudflareIdentifiers({
      env,
      cloudflareClient: createZoneClient([{ id: 'z1' }]),
    }),
    /identificadores de zona o cuenta/,
  );
  assert.equal(env.CF_ZONE_ID, undefined);
  assert.equal(env.CF_ACCOUNT_ID, undefined);
});

test('auto-configure: respuesta que no es un array se rechaza', async () => {
  await assert.rejects(
    () => ensureCloudflareIdentifiers({
      env: { ...BASE_ENV },
      cloudflareClient: createZoneClient(null),
    }),
    /No hay ninguna zona/,
  );
});

test('auto-configure: falta DOMAIN o CF_API_TOKEN antes de llamar a Cloudflare', async () => {
  const cloudflareClient = createZoneClient([]);

  await assert.rejects(
    () => ensureCloudflareIdentifiers({ env: { CF_API_TOKEN: 'tok' }, cloudflareClient }),
    /faltan DOMAIN o CF_API_TOKEN/,
  );
  await assert.rejects(
    () => ensureCloudflareIdentifiers({ env: { DOMAIN: 'example.com' }, cloudflareClient }),
    /faltan DOMAIN o CF_API_TOKEN/,
  );
  assert.deepEqual(cloudflareClient.calls, [], 'no debe llamarse a Cloudflare sin configuración');
});

test('auto-configure: con solo uno de los dos IDs, autodetecta igualmente', async () => {
  const env = { ...BASE_ENV, CF_ZONE_ID: 'zone-manual' };
  const cloudflareClient = createZoneClient([{ id: 'zone-detectada', account: { id: 'acct1' } }]);

  await ensureCloudflareIdentifiers({ env, cloudflareClient });

  assert.equal(cloudflareClient.calls.length, 1);
  assert.equal(env.CF_ACCOUNT_ID, 'acct1');
});

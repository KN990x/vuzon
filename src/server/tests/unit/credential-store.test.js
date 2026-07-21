import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createCredentialStore } from '../../features/auth/credential-store.js';

function tempDataDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuzon-creds-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const PASSWORD = 'a-long-enough-password';

test('credential-store: a fresh data directory is "not configured"', (t) => {
  const store = createCredentialStore({ dataDir: tempDataDir(t) });
  assert.equal(store.isConfigured(), false);
  assert.equal(store.getUsername(), '');
});

test('credential-store: save() then verify()', async (t) => {
  const store = createCredentialStore({ dataDir: tempDataDir(t) });
  await store.save({ username: 'kn', password: PASSWORD });

  assert.equal(store.isConfigured(), true);
  assert.equal(store.getUsername(), 'kn');
  assert.equal(await store.verify({ username: 'kn', password: PASSWORD }), true);
  assert.equal(await store.verify({ username: 'kn', password: 'wrong-password!' }), false);
  assert.equal(await store.verify({ username: 'someone-else', password: PASSWORD }), false);
});

test('credential-store: verify() on an unconfigured store answers false, not a crash', async (t) => {
  // The route must be able to call it before setup without special-casing: the decoy
  // record keeps the timing (and the code path) identical.
  const store = createCredentialStore({ dataDir: tempDataDir(t) });
  assert.equal(await store.verify({ username: 'kn', password: PASSWORD }), false);
});

test('credential-store: the password is never written in the clear', async (t) => {
  const dataDir = tempDataDir(t);
  const store = createCredentialStore({ dataDir });
  await store.save({ username: 'kn', password: PASSWORD });

  const raw = fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8');
  assert.equal(raw.includes(PASSWORD), false);

  const record = JSON.parse(raw);
  assert.equal(record.version, 1);
  assert.equal(record.username, 'kn');
  assert.equal(record.password.algo, 'scrypt');
  // The KDF parameters travel with the record so they can be raised later without
  // invalidating credentials saved with the old ones.
  assert.ok(record.password.N > 0 && record.password.r > 0 && record.password.p > 0);
  assert.ok(record.password.salt && record.password.hash);
});

test('credential-store: two saves of the same password produce different hashes (salt)', async (t) => {
  const dataDir = tempDataDir(t);
  const store = createCredentialStore({ dataDir });

  await store.save({ username: 'kn', password: PASSWORD });
  const first = JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8'));
  await store.save({ username: 'kn', password: PASSWORD });
  const second = JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8'));

  assert.notEqual(first.password.salt, second.password.salt);
  assert.notEqual(first.password.hash, second.password.hash);
});

test('credential-store: the file is owner-only and leaves no temporary behind', async (t) => {
  const dataDir = tempDataDir(t);
  const store = createCredentialStore({ dataDir });
  await store.save({ username: 'kn', password: PASSWORD });

  const filePath = path.join(dataDir, 'auth.json');
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
});

test('credential-store: a leftover .tmp from a crash does not break the next save', async (t) => {
  const dataDir = tempDataDir(t);
  fs.writeFileSync(path.join(dataDir, 'auth.json.tmp'), 'garbage', { mode: 0o644 });

  const store = createCredentialStore({ dataDir });
  await store.save({ username: 'kn', password: PASSWORD });

  const filePath = path.join(dataDir, 'auth.json');
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.equal(await store.verify({ username: 'kn', password: PASSWORD }), true);
});

test('credential-store: the record survives a restart', async (t) => {
  const dataDir = tempDataDir(t);
  await createCredentialStore({ dataDir }).save({ username: 'kn', password: PASSWORD });

  const restarted = createCredentialStore({ dataDir });
  assert.equal(restarted.isConfigured(), true);
  assert.equal(restarted.getUsername(), 'kn');
  assert.equal(await restarted.verify({ username: 'kn', password: PASSWORD }), true);
});

test('credential-store: a corrupt file throws instead of reopening the setup wizard', (t) => {
  const dataDir = tempDataDir(t);
  fs.writeFileSync(path.join(dataDir, 'auth.json'), '{ not json');

  // Treating it as "not configured" would hand the panel to whoever asked first.
  assert.throws(() => createCredentialStore({ dataDir }), /not valid JSON/i);
});

test('credential-store: a record with an unexpected shape throws too', (t) => {
  const dataDir = tempDataDir(t);
  fs.writeFileSync(
    path.join(dataDir, 'auth.json'),
    JSON.stringify({ version: 1, username: 'kn', password: { algo: 'md5' } }),
  );

  assert.throws(() => createCredentialStore({ dataDir }), /expected shape/i);
});

test('credential-store: the username is trimmed on save, like the schema does', async (t) => {
  const store = createCredentialStore({ dataDir: tempDataDir(t) });
  await store.save({ username: '  kn  ', password: PASSWORD });
  assert.equal(store.getUsername(), 'kn');
  assert.equal(await store.verify({ username: 'kn', password: PASSWORD }), true);
});

test('credential-store: updateUsername() renames without re-hashing the password', async (t) => {
  const dataDir = tempDataDir(t);
  const store = createCredentialStore({ dataDir });
  await store.save({ username: 'kn', password: PASSWORD });

  const before = JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8'));
  store.updateUsername('  owner  ');
  const after = JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8'));

  assert.equal(store.getUsername(), 'owner');
  assert.equal(after.username, 'owner');
  assert.equal(after.password.salt, before.password.salt);
  assert.equal(after.password.hash, before.password.hash);
  assert.equal(await store.verify({ username: 'owner', password: PASSWORD }), true);
  assert.equal(await store.verify({ username: 'kn', password: PASSWORD }), false);
});

test('credential-store: updateUsername() on an empty store throws', (t) => {
  const store = createCredentialStore({ dataDir: tempDataDir(t) });
  assert.throws(() => store.updateUsername('owner'), /before the panel has credentials/i);
});

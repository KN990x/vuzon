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
  await store.updateUsername('  owner  ');
  const after = JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8'));

  assert.equal(store.getUsername(), 'owner');
  assert.equal(after.username, 'owner');
  assert.equal(after.password.salt, before.password.salt);
  assert.equal(after.password.hash, before.password.hash);
  assert.equal(await store.verify({ username: 'owner', password: PASSWORD }), true);
  assert.equal(await store.verify({ username: 'kn', password: PASSWORD }), false);
});

test('credential-store: updateUsername() on an empty store throws', async (t) => {
  const store = createCredentialStore({ dataDir: tempDataDir(t) });
  await assert.rejects(() => store.updateUsername('owner'), /before the panel has credentials/i);
});

test('credential-store: updatePassword() on an empty store throws', async (t) => {
  const store = createCredentialStore({ dataDir: tempDataDir(t) });
  await assert.rejects(() => store.updatePassword(PASSWORD), /before the panel has credentials/i);
});

/**
 * The unique temp name in `writeRecordAtomically` is documented as fixing a real crash: a
 * shared `${filePath}.tmp` let a second writer `rmSync` the file the first had just
 * written, so its `renameSync` threw ENOENT. Nothing asserted it, so the reasoning could
 * have been undone without any test noticing.
 *
 * Concurrency here is genuinely reachable: `POST /api/account/password` and
 * `/api/account/username` are separate routes with no lock between them.
 */
test('credential-store: concurrent writes never corrupt auth.json or throw ENOENT', async (t) => {
  const dataDir = tempDataDir(t);
  const store = createCredentialStore({ dataDir });
  await store.save({ username: 'kn', password: PASSWORD });

  // Enough overlapping writers that a shared temp name would collide.
  const writes = [];
  for (let i = 0; i < 12; i += 1) {
    writes.push(store.save({ username: `user${i}`, password: `${PASSWORD}-${i}` }));
    writes.push(store.updateUsername(`renamed${i}`));
  }
  // Any ENOENT from the rename would surface here.
  await Promise.all(writes);

  // Whatever won, the file must be ONE valid record — never truncated or interleaved.
  const raw = fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(typeof parsed.username, 'string');
  assert.ok(parsed.username.length > 0);
  assert.equal(typeof parsed.password.hash, 'string');
  assert.equal(typeof parsed.password.salt, 'string');

  // And no temp files may be left lying around with their 0600 content.
  const leftovers = fs.readdirSync(dataDir).filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, [], 'atomic writes must clean up their temp files');

  // A fresh store reading from disk agrees with the one in memory.
  const reopened = createCredentialStore({ dataDir });
  assert.equal(reopened.getUsername(), parsed.username);
});

test('credential-store: overlapping password and username changes both survive', async (t) => {
  const dataDir = tempDataDir(t);
  const store = createCredentialStore({ dataDir });
  await store.save({ username: 'kn', password: PASSWORD });

  // The two account routes have no lock between them. Without a write queue, save() hashed
  // against a username captured before scrypt yielded, and updateUsername wrote the old
  // hash — one of the two changes was always lost. Both must be on disk when they finish.
  await Promise.all([
    store.updatePassword(`${PASSWORD}-new`),
    store.updateUsername('owner'),
  ]);

  const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, 'auth.json'), 'utf8'));
  assert.equal(parsed.username, 'owner');
  const reopened = createCredentialStore({ dataDir });
  assert.equal(reopened.getUsername(), 'owner');
  assert.equal(await reopened.verify({ username: 'owner', password: `${PASSWORD}-new` }), true);
  assert.equal(await reopened.verify({ username: 'owner', password: PASSWORD }), false);
  assert.equal(await reopened.verify({ username: 'kn', password: `${PASSWORD}-new` }), false);
});

test('credential-store: auth.json is written owner-only (0600)', async (t) => {
  const dataDir = tempDataDir(t);
  const store = createCredentialStore({ dataDir });
  await store.save({ username: 'kn', password: PASSWORD });

  // Whoever can read this file can mount an offline attack on the hash at their leisure.
  const mode = fs.statSync(path.join(dataDir, 'auth.json')).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
});

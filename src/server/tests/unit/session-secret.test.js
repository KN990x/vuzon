import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { resolveSessionSecret } from '../../config/session-secret.js';

function tempDataDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuzon-secret-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('resolveSessionSecret: generates 64 hex chars into the data directory', (t) => {
  const dataDir = tempDataDir(t);
  const secret = resolveSessionSecret({ dataDir });

  assert.match(secret, /^[a-f0-9]{64}$/);
  const filePath = path.join(dataDir, 'session-secret');
  assert.equal(fs.readFileSync(filePath, 'utf8').trim(), secret);
  // Whoever reads this file can forge a logged-in cookie.
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
});

test('resolveSessionSecret: the generated secret is reused on the next start', (t) => {
  // This is the whole point of persisting it: `docker compose up -d` after an update must
  // not log the user out, which is what the old ephemeral fallback did.
  const dataDir = tempDataDir(t);
  assert.equal(resolveSessionSecret({ dataDir }), resolveSessionSecret({ dataDir }));
});

test('resolveSessionSecret: SESSION_SECRET in the environment is ignored', (t) => {
  // It stopped being a configuration knob: one fewer line to get wrong in a public
  // template, and no way to end up signing cookies with a key somebody published.
  const dataDir = tempDataDir(t);
  const secret = resolveSessionSecret({
    env: { SESSION_SECRET: 'from-env-and-not-used' },
    dataDir,
  });

  assert.notEqual(secret, 'from-env-and-not-used');
  assert.match(secret, /^[a-f0-9]{64}$/);
});

test('resolveSessionSecret: an empty file is treated as missing and regenerated', (t) => {
  // Shape of an interrupted first boot or a badly restored volume. Sessions signed with
  // the lost key stop being valid, which is the correct outcome.
  const dataDir = tempDataDir(t);
  const filePath = path.join(dataDir, 'session-secret');
  fs.writeFileSync(filePath, '   \n');

  const secret = resolveSessionSecret({ dataDir });
  assert.match(secret, /^[a-f0-9]{64}$/);
  assert.equal(fs.readFileSync(filePath, 'utf8').trim(), secret);
});

test('resolveSessionSecret: a directory it cannot read from surfaces the error', (t) => {
  const dataDir = tempDataDir(t);
  // A directory where the file should be: readFileSync fails with EISDIR, not ENOENT.
  fs.mkdirSync(path.join(dataDir, 'session-secret'));

  assert.throws(() => resolveSessionSecret({ dataDir }), /session secret file/i);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { getDataDirConfigurationIssue, resolveDataDir } from '../../platform/storage/data-dir.js';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuzon-datadir-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('resolveDataDir: VUZON_DATA_DIR wins and is resolved to an absolute path', () => {
  assert.equal(resolveDataDir({ VUZON_DATA_DIR: '/srv/vuzon' }), '/srv/vuzon');
  assert.equal(resolveDataDir({ VUZON_DATA_DIR: './state' }), path.resolve('./state'));
});

test('resolveDataDir: whitespace-only is treated as unset', () => {
  assert.equal(resolveDataDir({ VUZON_DATA_DIR: '   ' }), resolveDataDir({}));
});

test('resolveDataDir: the default does not depend on the CWD', () => {
  // Derived from the module's own location, like resolvePublicDir: running the server from
  // another directory must not move where the credentials live.
  const fromRoot = resolveDataDir({});
  assert.ok(path.isAbsolute(fromRoot));
  assert.equal(path.basename(fromRoot), 'data');
});

test('getDataDirConfigurationIssue: an existing writable directory is fine', (t) => {
  assert.equal(getDataDirConfigurationIssue(tempDir(t)), null);
});

test('getDataDirConfigurationIssue: a missing directory is created', (t) => {
  const nested = path.join(tempDir(t), 'a', 'b');
  assert.equal(getDataDirConfigurationIssue(nested), null);
  assert.ok(fs.existsSync(nested));
});

test('getDataDirConfigurationIssue: a read-only directory is reported, not ignored', (t) => {
  const dir = tempDir(t);
  const target = path.join(dir, 'locked');
  fs.mkdirSync(target, { mode: 0o500 });

  try {
    const issue = getDataDirConfigurationIssue(target);
    assert.ok(issue, 'expected an issue for a non-writable data directory');
    assert.match(issue, /not writable/i);
  } finally {
    // Restored here and not in `t.after`: the directory cleanup registered by tempDir()
    // runs first, and chmod on a deleted path throws ENOENT.
    fs.chmodSync(target, 0o700);
  }
});

test('getDataDirConfigurationIssue: a path that is a file cannot be created as a directory', (t) => {
  const filePath = path.join(tempDir(t), 'a-file');
  fs.writeFileSync(filePath, 'x');

  const issue = getDataDirConfigurationIssue(filePath);
  assert.ok(issue, 'expected an issue when the path is not a directory');
});

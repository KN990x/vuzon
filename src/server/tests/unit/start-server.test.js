import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { startServer } from '../../bootstrap/start-server.js';

/**
 * Every case here must point VUZON_DATA_DIR somewhere disposable: the startup checks
 * create the data directory, and a test has no business writing into the repository.
 *
 * Every case must also FAIL before `listenWhenReady`. A `startServer` that gets through
 * binds a real port and keeps the event loop alive, which hangs the whole run instead of
 * failing an assertion.
 */
function tempDataDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vuzon-start-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('startServer: a data directory it cannot write to invokes exitProcess(1)', async (t) => {
  let exitCode = null;
  const exitProcess = (code) => {
    exitCode = code;
    throw new Error('TEST_EXIT');
  };
  // A path that is a file, i.e. the shape of "the volume was never mounted": the panel
  // stores its credentials there, so this has to fail at boot and not at the first POST.
  const filePath = path.join(tempDataDir(t), 'not-a-directory');
  fs.writeFileSync(filePath, 'x');

  const env = {
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    CF_API_TOKEN: 'tok',
    NODE_ENV: 'development',
    SESSION_SECRET: 'test-session-secret-32chars!!',
    VUZON_DATA_DIR: filePath,
  };

  await assert.rejects(
    () => startServer({ env, exitProcess }),
    /TEST_EXIT/,
  );
  assert.equal(exitCode, 1);
});

test('startServer: without CF_API_TOKEN it invokes exitProcess(1)', async (t) => {
  let exitCode = null;
  const exitProcess = (code) => {
    exitCode = code;
    throw new Error('TEST_EXIT');
  };
  const env = {
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    NODE_ENV: 'development',
    SESSION_SECRET: 'test-session-secret-32chars!!',
    VUZON_DATA_DIR: tempDataDir(t),
  };

  await assert.rejects(() => startServer({ env, exitProcess }), /TEST_EXIT/);
  assert.equal(exitCode, 1);
});

test('startServer: accumulates several synchronous failures into one message', async (t) => {
  const logged = [];
  const origError = console.error;
  console.error = (...args) => {
    logged.push(args.join(' '));
  };
  try {
    let exitCode = null;
    const exitProcess = (code) => {
      exitCode = code;
      throw new Error('TEST_EXIT');
    };
    const unusable = path.join(tempDataDir(t), 'not-a-directory');
    fs.writeFileSync(unusable, 'x');
    const env = { NODE_ENV: 'development', VUZON_DATA_DIR: unusable };

    await assert.rejects(() => startServer({ env, exitProcess }), /TEST_EXIT/);
    assert.equal(exitCode, 1);

    const text = logged.join('\n');
    assert.match(text, /not-a-directory/);
    assert.match(text, /DOMAIN/);
    assert.match(text, /CF_API_TOKEN/);
    assert.ok(
      (text.match(/ {3}- /g) ?? []).length >= 3,
      'expected at least three error bullets',
    );
  } finally {
    console.error = origError;
  }
});

test('startServer: a missing zone prints the actionable Zone/account hint', async (t) => {
  const logged = [];
  const origError = console.error;
  console.error = (...args) => {
    logged.push(args.join(' '));
  };
  try {
    let exitCode = null;
    const exitProcess = (code) => {
      exitCode = code;
      throw new Error('TEST_EXIT');
    };
    // No CF_ZONE_ID / CF_ACCOUNT_ID → auto-configure runs and finds no zone.
    const env = {
      DOMAIN: 'homelab.test',
      CF_API_TOKEN: 'tok',
      NODE_ENV: 'development',
      SESSION_SECRET: 'test-session-secret-32chars!!',
      VUZON_DATA_DIR: tempDataDir(t),
    };
    const cloudflareClient = {
      async fetchCloudflare() {
        return [];
      },
    };

    await assert.rejects(() => startServer({ env, exitProcess, cloudflareClient }), /TEST_EXIT/);
    assert.equal(exitCode, 1);
    const text = logged.join('\n');
    assert.match(text, /There is no "homelab\.test" zone/);
    assert.match(text, /Zone\/account: the token must belong to the account that owns DOMAIN/);
  } finally {
    console.error = origError;
  }
});

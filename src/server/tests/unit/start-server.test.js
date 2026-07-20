import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startServer } from '../../bootstrap/start-server.js';

test('startServer: without panel credentials it invokes exitProcess(1)', async () => {
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
  };

  await assert.rejects(
    () => startServer({ env, exitProcess }),
    /TEST_EXIT/,
  );
  assert.equal(exitCode, 1);
});

test('startServer: without CF_API_TOKEN it invokes exitProcess(1)', async () => {
  let exitCode = null;
  const exitProcess = (code) => {
    exitCode = code;
    throw new Error('TEST_EXIT');
  };
  const env = {
    CF_ZONE_ID: 'zone_test_1',
    CF_ACCOUNT_ID: 'acct_test_1',
    DOMAIN: 'example.com',
    AUTH_USER: 'admin',
    AUTH_PASS: 'secret',
    NODE_ENV: 'development',
    SESSION_SECRET: 'test-session-secret-32chars!!',
  };

  await assert.rejects(() => startServer({ env, exitProcess }), /TEST_EXIT/);
  assert.equal(exitCode, 1);
});

test('startServer: accumulates several synchronous failures into one message', async () => {
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
    const env = { NODE_ENV: 'development' };

    await assert.rejects(() => startServer({ env, exitProcess }), /TEST_EXIT/);
    assert.equal(exitCode, 1);

    const text = logged.join('\n');
    assert.match(text, /AUTH_USER/);
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

test('startServer: an invalid SESSION_SECRET in production uses exitProcess(1)', async () => {
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
    const env = {
      CF_ZONE_ID: 'zone_test_1',
      CF_ACCOUNT_ID: 'acct_test_1',
      DOMAIN: 'example.com',
      AUTH_USER: 'admin',
      AUTH_PASS: 'secret',
      CF_API_TOKEN: 'tok',
      NODE_ENV: 'production',
      SESSION_SECRET: 'too-short',
    };

    await assert.rejects(() => startServer({ env, exitProcess }), /TEST_EXIT/);
    assert.equal(exitCode, 1);
    assert.match(logged.join('\n'), /SESSION_SECRET/);
  } finally {
    console.error = origError;
  }
});

test('startServer: a missing zone prints the actionable Zone/account hint', async () => {
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
      AUTH_USER: 'admin',
      AUTH_PASS: 'secret',
      CF_API_TOKEN: 'tok',
      NODE_ENV: 'development',
      SESSION_SECRET: 'test-session-secret-32chars!!',
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

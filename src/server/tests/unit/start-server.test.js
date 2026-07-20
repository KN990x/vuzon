import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startServer } from '../../bootstrap/start-server.js';

test('startServer: sin credenciales del panel invoca exitProcess(1)', async () => {
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

test('startServer: sin CF_API_TOKEN invoca exitProcess(1)', async () => {
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

test('startServer: acumula varios fallos síncronos en un solo mensaje', async () => {
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
      'se esperaban al menos tres viñetas de error',
    );
  } finally {
    console.error = origError;
  }
});

test('startServer: SESSION_SECRET inválido en production usa exitProcess(1)', async () => {
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

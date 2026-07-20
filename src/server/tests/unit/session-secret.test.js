import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSessionSecret } from '../../config/session-secret.js';

test('resolveSessionSecret: SESSION_SECRET from env', () => {
  const secret = resolveSessionSecret({
    env: { SESSION_SECRET: 'from-env' },
  });
  assert.equal(secret, 'from-env');
});

test('resolveSessionSecret: trims SESSION_SECRET', () => {
  const secret = resolveSessionSecret({
    env: { SESSION_SECRET: '  trimmed-secret  \n' },
  });
  assert.equal(secret, 'trimmed-secret');
});

test('resolveSessionSecret: a whitespace-only SESSION_SECRET is treated as missing', async (t) => {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.join(' '));
  };
  t.after(() => {
    console.warn = origWarn;
  });

  const secret = resolveSessionSecret({
    env: { SESSION_SECRET: '   \t  ', NODE_ENV: 'development' },
  });

  assert.match(secret, /^[a-f0-9]{64}$/);
  assert.match(warnings.join('\n'), /SESSION_SECRET/i);
});

test('resolveSessionSecret: without SESSION_SECRET it generates 64 hex chars and warns (development)', async (t) => {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.join(' '));
  };
  t.after(() => {
    console.warn = origWarn;
  });

  const secret = resolveSessionSecret({ env: { NODE_ENV: 'development' } });

  assert.match(secret, /^[a-f0-9]{64}$/);
  assert.match(warnings.join('\n'), /SESSION_SECRET/i);
  assert.match(warnings.join('\n'), /restart/i);
});

test('resolveSessionSecret: in production without SESSION_SECRET it throws', () => {
  assert.throws(
    () => resolveSessionSecret({ env: { NODE_ENV: 'production' } }),
    /SESSION_SECRET.*required/i,
  );
});

test('resolveSessionSecret: in production with SESSION_SECRET it uses it', () => {
  const prodSecret = 'a'.repeat(32);
  const secret = resolveSessionSecret({
    env: {
      NODE_ENV: 'production',
      SESSION_SECRET: prodSecret,
    },
  });
  assert.equal(secret, prodSecret);
});

test('resolveSessionSecret: in production it rejects an overly short secret', () => {
  assert.throws(
    () => resolveSessionSecret({
      env: { NODE_ENV: 'production', SESSION_SECRET: 'too-short' },
    }),
    /at least 32/i,
  );
});

test('resolveSessionSecret: in development it accepts a short secret', () => {
  const secret = resolveSessionSecret({
    env: { NODE_ENV: 'development', SESSION_SECRET: 'short' },
  });
  assert.equal(secret, 'short');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSessionSecret } from '../../config/session-secret.js';

test('resolveSessionSecret: SESSION_SECRET en env', () => {
  const secret = resolveSessionSecret({
    env: { SESSION_SECRET: 'from-env' },
  });
  assert.equal(secret, 'from-env');
});

test('resolveSessionSecret: aplica trim a SESSION_SECRET', () => {
  const secret = resolveSessionSecret({
    env: { SESSION_SECRET: '  trimmed-secret  \n' },
  });
  assert.equal(secret, 'trimmed-secret');
});

test('resolveSessionSecret: SESSION_SECRET solo espacios se trata como ausente', async (t) => {
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

test('resolveSessionSecret: sin SESSION_SECRET genera hex 64 y avisa (desarrollo)', async (t) => {
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
  assert.match(warnings.join('\n'), /reinicio/i);
});

test('resolveSessionSecret: en production sin SESSION_SECRET lanza error', () => {
  assert.throws(
    () => resolveSessionSecret({ env: { NODE_ENV: 'production' } }),
    /SESSION_SECRET.*obligatorio/i,
  );
});

test('resolveSessionSecret: en production con SESSION_SECRET lo usa', () => {
  const prodSecret = 'a'.repeat(32);
  const secret = resolveSessionSecret({
    env: {
      NODE_ENV: 'production',
      SESSION_SECRET: prodSecret,
    },
  });
  assert.equal(secret, prodSecret);
});

test('resolveSessionSecret: en production rechaza secreto demasiado corto', () => {
  assert.throws(
    () => resolveSessionSecret({
      env: { NODE_ENV: 'production', SESSION_SECRET: 'too-short' },
    }),
    /al menos 32/i,
  );
});

test('resolveSessionSecret: en desarrollo acepta secreto corto', () => {
  const secret = resolveSessionSecret({
    env: { NODE_ENV: 'development', SESSION_SECRET: 'short' },
  });
  assert.equal(secret, 'short');
});

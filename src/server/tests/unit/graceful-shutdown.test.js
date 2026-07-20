import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { registerGracefulShutdown } from '../../bootstrap/start-server.js';

/** Fake HTTP server: it only needs `close(cb)`. */
function createFakeServer({ closeError = null, autoClose = true } = {}) {
  let pendingCallback = null;
  return {
    closeCalls: 0,
    close(cb) {
      this.closeCalls += 1;
      if (autoClose) {
        cb(closeError);
      } else {
        pendingCallback = cb;
      }
    },
    finishClose(err = null) {
      pendingCallback?.(err);
    },
  };
}

test('graceful shutdown: SIGTERM closes the server and exits with 0', () => {
  const server = createFakeServer();
  const processRef = new EventEmitter();
  const exitCodes = [];

  const unregister = registerGracefulShutdown(server, {
    exitProcess: (code) => exitCodes.push(code),
    processRef,
  });

  processRef.emit('SIGTERM');

  assert.equal(server.closeCalls, 1);
  assert.deepEqual(exitCodes, [0]);
  unregister();
});

test('graceful shutdown: SIGINT is covered too', () => {
  const server = createFakeServer();
  const processRef = new EventEmitter();
  const exitCodes = [];

  const unregister = registerGracefulShutdown(server, {
    exitProcess: (code) => exitCodes.push(code),
    processRef,
  });

  processRef.emit('SIGINT');

  assert.equal(server.closeCalls, 1);
  assert.deepEqual(exitCodes, [0]);
  unregister();
});

test('graceful shutdown: a second signal does not restart the shutdown', () => {
  const server = createFakeServer({ autoClose: false });
  const processRef = new EventEmitter();
  const exitCodes = [];

  const unregister = registerGracefulShutdown(server, {
    exitProcess: (code) => exitCodes.push(code),
    processRef,
  });

  processRef.emit('SIGTERM');
  processRef.emit('SIGTERM');
  processRef.emit('SIGINT');

  assert.equal(server.closeCalls, 1, 'close() must only be called once');
  assert.deepEqual(exitCodes, []);

  server.finishClose();
  assert.deepEqual(exitCodes, [0]);
  unregister();
});

test('graceful shutdown: a failure while closing exits with 1', () => {
  const server = createFakeServer({ closeError: new Error('boom') });
  const processRef = new EventEmitter();
  const exitCodes = [];

  const unregister = registerGracefulShutdown(server, {
    exitProcess: (code) => exitCodes.push(code),
    processRef,
  });

  processRef.emit('SIGTERM');

  assert.deepEqual(exitCodes, [1]);
  unregister();
});

test('graceful shutdown: if closing drags on, the timeout forces the exit', async () => {
  const server = createFakeServer({ autoClose: false });
  const processRef = new EventEmitter();
  const exitCodes = [];

  const unregister = registerGracefulShutdown(server, {
    graceMs: 10,
    exitProcess: (code) => exitCodes.push(code),
    processRef,
  });

  processRef.emit('SIGTERM');
  assert.deepEqual(exitCodes, []);

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(exitCodes, [1]);
  unregister();
});

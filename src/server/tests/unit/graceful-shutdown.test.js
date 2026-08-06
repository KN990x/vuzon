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

/**
 * The tests above drive a fake server whose `close` fires synchronously, so none of them
 * exercises a REAL http.Server. This one does.
 *
 * What it pins down is the force-timer path. `server.close()` deliberately waits for
 * in-flight requests — that is what "graceful" means — so a client that never lets its
 * request finish keeps the close pending forever. Only `closeAllConnections()` unblocks
 * it, which is why the timeout branch calls it before exiting.
 *
 * (Idle keep-alive sockets need no help: Node has dropped those inside `close()` since
 * v19, measured at ~1ms here. See the comment in start-server.js.)
 */
test('graceful shutdown: the timeout cuts a stuck in-flight request instead of hanging', async () => {
  const http = await import('node:http');
  const net = await import('node:net');

  // Never answers: every connection stays active for as long as the client holds it.
  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const socket = net.connect(port, '127.0.0.1');
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.on('connect', () => {
      socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
      // Give the server a tick to register the request as in-flight.
      setTimeout(resolve, 50);
    });
  });

  const processRef = new EventEmitter();
  const exitCodes = [];
  const unregister = registerGracefulShutdown(server, {
    graceMs: 100,
    exitProcess: (code) => exitCodes.push(code),
    processRef,
  });

  processRef.emit('SIGTERM');

  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 5_000;
    const poll = setInterval(() => {
      if (exitCodes.length > 0) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(poll);
        reject(new Error('the shutdown never completed: the stuck request held it open'));
      }
    }, 10);
  });

  // 1, not 0: the request never drained, so this is the forced path. Reaching it at all is
  // the assertion — without closeAllConnections the socket outlives the exit and the
  // process (or, here, the test run) is left with a live handle.
  assert.deepEqual(exitCodes, [1]);

  unregister();
  socket.destroy();
  await new Promise((resolve) => server.close(resolve));
});

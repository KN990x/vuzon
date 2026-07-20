import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { registerGracefulShutdown } from '../../bootstrap/start-server.js';

/** Servidor HTTP falso: solo necesita `close(cb)`. */
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

test('apagado ordenado: SIGTERM cierra el servidor y sale con 0', () => {
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

test('apagado ordenado: SIGINT también está cubierto', () => {
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

test('apagado ordenado: una segunda señal no reinicia el cierre', () => {
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

  assert.equal(server.closeCalls, 1, 'close() solo debe llamarse una vez');
  assert.deepEqual(exitCodes, []);

  server.finishClose();
  assert.deepEqual(exitCodes, [0]);
  unregister();
});

test('apagado ordenado: un fallo al cerrar sale con 1', () => {
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

test('apagado ordenado: si el cierre se eterniza, el timeout fuerza la salida', async () => {
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

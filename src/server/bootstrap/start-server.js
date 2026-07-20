import fs from 'node:fs';
import {
  assertCloudflareEnvConfigured,
  getCfApiToken,
  getCfApiTokenConfigurationIssue,
  getCloudflareIdsConfigurationIssueIfFullySpecified,
} from '../config/cloudflare-env.js';
import { getDomainConfigurationIssue } from '../config/domain-env.js';
import { getPanelAuthConfigurationIssue, getPanelAuthCredentials } from '../config/panel-auth-env.js';
import { getPlaceholderConfigurationIssue } from '../config/placeholder-guard.js';
import { createApp } from './create-app.js';
import { ensureCloudflareIdentifiers } from '../platform/cloudflare/auto-configure.js';
import { createCloudflareClient } from '../platform/cloudflare/client.js';

const RUNNING_IN_DOCKER = fs.existsSync('/.dockerenv');

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function requiredEnvHelp(env = process.env) {
  const base =
    '   Obligatorio en .env (plantilla .env.example): CF_API_TOKEN, DOMAIN, AUTH_USER, AUTH_PASS.';
  if (env.NODE_ENV === 'production') {
    return `${base} En production también SESSION_SECRET (mín. 32 caracteres).`;
  }
  return `${base} En production/Docker también SESSION_SECRET.`;
}

function logDockerComposeHint() {
  if (RUNNING_IN_DOCKER) {
    console.error('   En Docker: docker compose logs -f vuzon');
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function collectSynchronousStartupConfigurationIssues(env) {
  return [
    getPanelAuthConfigurationIssue(env),
    getDomainConfigurationIssue(env),
    getCfApiTokenConfigurationIssue(env),
    getCloudflareIdsConfigurationIssueIfFullySpecified(env),
    getPlaceholderConfigurationIssue(env),
  ].filter((msg) => typeof msg === 'string' && msg.length > 0);
}

function listenWhenReady(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
  });
}

/**
 * Apagado ordenado: `docker stop` envía SIGTERM y espera 10s antes de SIGKILL. Sin esto
 * el proceso muere de golpe y corta las peticiones en vuelo (una mutación a mitad de
 * camino contra Cloudflare deja al panel desincronizado hasta el siguiente refresco).
 *
 * @param {import('node:http').Server} server
 * @param {{ signals?: string[], graceMs?: number, exitProcess: (code: number) => void,
 *           processRef?: NodeJS.Process }} opts
 * @returns {() => void} Baja los listeners (usado por los tests).
 */
export function registerGracefulShutdown(server, {
  signals = ['SIGTERM', 'SIGINT'],
  graceMs = 10_000,
  exitProcess,
  processRef = process,
}) {
  let shuttingDown = false;

  const onSignal = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`Recibido ${signal}: cerrando el servidor…`);

    // Si un cliente mantiene la conexión abierta, no esperamos indefinidamente.
    const forceTimer = setTimeout(() => {
      console.error('Cierre ordenado agotado; saliendo igualmente.');
      exitProcess(1);
    }, graceMs);
    // No mantiene vivo el event loop si el cierre termina antes.
    forceTimer.unref?.();

    server.close((err) => {
      clearTimeout(forceTimer);
      if (err) {
        console.error('Error al cerrar el servidor:', err.message);
        exitProcess(1);
        return;
      }
      exitProcess(0);
    });
  };

  const handlers = signals.map((signal) => {
    const handler = () => onSignal(signal);
    processRef.on(signal, handler);
    return { signal, handler };
  });

  return () => {
    for (const { signal, handler } of handlers) {
      processRef.removeListener(signal, handler);
    }
  };
}

export async function startServer({
  env = process.env,
  exitProcess = (code) => process.exit(code),
} = {}) {
  try {
    const syncIssues = collectSynchronousStartupConfigurationIssues(env);
    if (syncIssues.length > 0) {
      console.error('Error fatal en arranque: revisa .env');
      for (const issue of syncIssues) {
        console.error(`   - ${issue}`);
      }
      console.error(requiredEnvHelp(env));
      logDockerComposeHint();
      exitProcess(1);
      return;
    }

    env.CF_API_TOKEN = getCfApiToken(env);

    const cloudflareClient = createCloudflareClient({ env });
    await ensureCloudflareIdentifiers({ env, cloudflareClient });
    assertCloudflareEnvConfigured(env);

    const { app, runtime } = createApp({ env, cloudflareClient });

    const server = await listenWhenReady(app, runtime.port);
    const addr = server.address();
    const boundPort =
      typeof addr === 'object' && addr !== null && typeof addr.port === 'number'
        ? addr.port
        : runtime.port;

    server.on('error', (err) => {
      console.error(`Error en el servidor HTTP (puerto ${boundPort}):`, err.message);
      exitProcess(1);
    });

    registerGracefulShutdown(server, { exitProcess });

    const { authUser } = getPanelAuthCredentials(env);
    const panelUserLine = authUser
      ? runtime.isProduction
        ? 'Usuario del panel: configurado'
        : `Usuario del panel: ${authUser}`
      : 'Usuario del panel: no configurado';
    console.log(
      `Servidor en puerto ${boundPort} · producción: ${runtime.isProduction ? 'sí' : 'no'} · ${panelUserLine}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error fatal en arranque: ${message}`);
    console.error(requiredEnvHelp(env));
    if (
      /CF_ZONE_ID|CF_ACCOUNT_ID|\bzonas?\b|autoconfigur/i.test(message)
    ) {
      console.error(
        '   Zona/cuenta: el token debe ser de la cuenta donde está DOMAIN; si hay varias zonas con el mismo nombre, define CF_ZONE_ID y CF_ACCOUNT_ID.',
      );
    }
    logDockerComposeHint();
    exitProcess(1);
  }
}

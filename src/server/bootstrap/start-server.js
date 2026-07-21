import fs from 'node:fs';
import {
  assertCloudflareEnvConfigured,
  getCfApiToken,
  getCfApiTokenConfigurationIssue,
  getCloudflareIdsConfigurationIssueIfFullySpecified,
} from '../config/cloudflare-env.js';
import { getDomainConfigurationIssue } from '../config/domain-env.js';
import { getPlaceholderConfigurationIssue } from '../config/placeholder-guard.js';
import { warnIfLegacyAuthEnvVarsSet } from '../config/legacy-auth-env.js';
import { createApp } from './create-app.js';
import { ensureCloudflareIdentifiers } from '../platform/cloudflare/auto-configure.js';
import { createCloudflareClient } from '../platform/cloudflare/client.js';
import { getDataDirConfigurationIssue, resolveDataDir } from '../platform/storage/data-dir.js';

const RUNNING_IN_DOCKER = fs.existsSync('/.dockerenv');

/**
 * @returns {string}
 */
function requiredEnvHelp() {
  return '   Required in .env (see the .env.example template): CF_API_TOKEN, DOMAIN.\n'
    + '   The panel username and password are NOT environment variables: they are chosen '
    + 'in the browser the first time you open the panel.';
}

function logDockerComposeHint() {
  if (RUNNING_IN_DOCKER) {
    console.error('   In Docker: docker compose logs -f vuzon');
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function collectSynchronousStartupConfigurationIssues(env) {
  return [
    // Before anything else: the panel keeps its credentials there, so a volume that was
    // never mounted must fail here and not when the user submits the setup form.
    getDataDirConfigurationIssue(resolveDataDir(env)),
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
 * Graceful shutdown: `docker stop` sends SIGTERM and waits 10s before SIGKILL. Without
 * this the process dies at once and cuts in-flight requests (a mutation half-way through
 * against Cloudflare leaves the panel out of sync until the next refresh).
 *
 * @param {import('node:http').Server} server
 * @param {{ signals?: string[], graceMs?: number, exitProcess: (code: number) => void,
 *           processRef?: NodeJS.Process }} opts
 * @returns {() => void} Removes the listeners (used by the tests).
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
    console.log(`Received ${signal}: shutting the server down…`);

    // If a client holds the connection open, do not wait indefinitely.
    const forceTimer = setTimeout(() => {
      console.error('Graceful shutdown timed out; exiting anyway.');
      exitProcess(1);
    }, graceMs);
    // Does not keep the event loop alive if the shutdown finishes first.
    forceTimer.unref?.();

    server.close((err) => {
      clearTimeout(forceTimer);
      if (err) {
        console.error('Error while closing the server:', err.message);
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
  cloudflareClient: injectedCloudflareClient = null,
} = {}) {
  try {
    const syncIssues = collectSynchronousStartupConfigurationIssues(env);
    if (syncIssues.length > 0) {
      console.error('Fatal startup error: check .env');
      for (const issue of syncIssues) {
        console.error(`   - ${issue}`);
      }
      console.error(requiredEnvHelp());
      logDockerComposeHint();
      exitProcess(1);
      return;
    }

    env.CF_API_TOKEN = getCfApiToken(env);

    const cloudflareClient = injectedCloudflareClient || createCloudflareClient({ env });
    await ensureCloudflareIdentifiers({ env, cloudflareClient });
    assertCloudflareEnvConfigured(env);

    const { app, runtime, credentialStore } = createApp({ env, cloudflareClient });

    const server = await listenWhenReady(app, runtime.port);
    const addr = server.address();
    const boundPort =
      typeof addr === 'object' && addr !== null && typeof addr.port === 'number'
        ? addr.port
        : runtime.port;

    server.on('error', (err) => {
      console.error(`HTTP server error (port ${boundPort}):`, err.message);
      exitProcess(1);
    });

    registerGracefulShutdown(server, { exitProcess });

    const authUser = credentialStore.getUsername();
    const panelUserLine = authUser
      ? runtime.isProduction
        ? 'Panel user: configured'
        : `Panel user: ${authUser}`
      : 'Panel user: NOT CONFIGURED';
    console.log(
      `Server on port ${boundPort} · production: ${runtime.isProduction ? 'yes' : 'no'} · ${panelUserLine}`,
    );

    // Leftovers from 1.x: still accepted by dotenv but no longer read. Say so once per boot
    // so an upgrade does not look like the password in .env is still in force.
    warnIfLegacyAuthEnvVarsSet(env);

    // The setup wizard is public until someone completes it: whoever opens the panel first
    // claims it. Saying so on every boot is the mitigation we chose over a setup token —
    // an unnoticed unconfigured panel is the only way that window stays open for long.
    if (!authUser) {
      console.warn(
        'The panel has no credentials yet. Open it in a browser to choose your username and '
          + 'password — until you do, anyone who can reach it could claim it.',
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Fatal startup error: ${message}`);
    console.error(requiredEnvHelp());
    if (
      /CF_ZONE_ID|CF_ACCOUNT_ID|\bzones?\b|auto-?configur/i.test(message)
    ) {
      console.error(
        '   Zone/account: the token must belong to the account that owns DOMAIN; if several zones share the same name, set CF_ZONE_ID and CF_ACCOUNT_ID.',
      );
    }
    logDockerComposeHint();
    exitProcess(1);
  }
}

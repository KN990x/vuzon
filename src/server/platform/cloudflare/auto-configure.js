import { getCfApiToken, getCloudflareResourceId } from '../../config/cloudflare-env.js';
import { getPanelDomain } from '../../config/domain-env.js';

export async function ensureCloudflareIdentifiers({
  env = process.env,
  cloudflareClient,
} = {}) {
  const configuredZoneId = getCloudflareResourceId('CF_ZONE_ID', env);
  const configuredAccountId = getCloudflareResourceId('CF_ACCOUNT_ID', env);
  if (configuredZoneId && configuredAccountId) {
    return;
  }

  console.log('Autoconfiguración: detectando CF_ZONE_ID y CF_ACCOUNT_ID…');

  const domain = getPanelDomain(env);
  const token = getCfApiToken(env);
  if (!domain || !token) {
    throw new Error(
      'No se puede autoconfigurar: faltan DOMAIN o CF_API_TOKEN en .env.',
    );
  }

  const zones = await cloudflareClient.fetchCloudflare(`/zones?name=${encodeURIComponent(domain)}`);

  if (!Array.isArray(zones) || zones.length === 0) {
    throw new Error(
      `No hay ninguna zona "${domain}" en la cuenta de Cloudflare de este token. Comprueba DOMAIN y que el API token sea de la misma cuenta donde está el dominio.`,
    );
  }

  if (zones.length > 1) {
    throw new Error(
      `Hay ${zones.length} zonas llamadas "${domain}"; la autoconfiguración no puede elegir una. Define CF_ZONE_ID y CF_ACCOUNT_ID manualmente en .env.`,
    );
  }

  const [zone] = zones;

  if (!zone || typeof zone !== 'object') {
    throw new Error(
      'La API de Cloudflare devolvió una zona inválida. Revisa DOMAIN, el token y define CF_ZONE_ID y CF_ACCOUNT_ID manualmente en .env si hace falta.',
    );
  }

  const accountId = zone.account && typeof zone.account === 'object' ? zone.account.id : undefined;
  if (!zone.id || !accountId) {
    throw new Error(
      'La API de Cloudflare no devolvió identificadores de zona o cuenta. Define CF_ZONE_ID y CF_ACCOUNT_ID manualmente en .env.',
    );
  }

  env.CF_ZONE_ID = zone.id;
  env.CF_ACCOUNT_ID = accountId;

  console.log(`Autoconfiguración lista para ${domain}`);
}

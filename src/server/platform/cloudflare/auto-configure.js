import { getCfApiToken, getCloudflareResourceId } from '../../config/cloudflare-env.js';
import { getPanelDomain } from '../../config/domain-env.js';

export async function ensureCloudflareIdentifiers({
  env = process.env,
  cloudflareClient,
  warn = console.warn,
} = {}) {
  const configuredZoneId = getCloudflareResourceId('CF_ZONE_ID', env);
  const configuredAccountId = getCloudflareResourceId('CF_ACCOUNT_ID', env);
  if (configuredZoneId && configuredAccountId) {
    return;
  }

  // The pair is all-or-nothing (see cloudflare-env.js): with only one set, detection runs
  // and overwrites it. Silently ignoring a value the user deliberately pinned is the kind
  // of thing that is only noticed once the panel points at the wrong zone.
  if (configuredZoneId || configuredAccountId) {
    const provided = configuredZoneId ? 'CF_ZONE_ID' : 'CF_ACCOUNT_ID';
    const missing = configuredZoneId ? 'CF_ACCOUNT_ID' : 'CF_ZONE_ID';
    warn(
      `Warning: ${provided} is set but ${missing} is not, so both are auto-detected from DOMAIN `
        + `and the ${provided} you configured is ignored. Set both, or neither.`,
    );
  }

  console.log('Auto-configuration: detecting CF_ZONE_ID and CF_ACCOUNT_ID…');

  const domain = getPanelDomain(env);
  const token = getCfApiToken(env);
  if (!domain || !token) {
    throw new Error(
      'Cannot auto-configure: DOMAIN or CF_API_TOKEN missing in .env.',
    );
  }

  const zones = await cloudflareClient.fetchCloudflare(`/zones?name=${encodeURIComponent(domain)}`);

  if (!Array.isArray(zones) || zones.length === 0) {
    throw new Error(
      `There is no "${domain}" zone in the Cloudflare account this token belongs to. Check DOMAIN, and that the API token comes from the same account that owns the domain.`,
    );
  }

  if (zones.length > 1) {
    throw new Error(
      `There are ${zones.length} zones named "${domain}"; auto-configuration cannot pick one. Set CF_ZONE_ID and CF_ACCOUNT_ID manually in .env.`,
    );
  }

  const [zone] = zones;

  if (!zone || typeof zone !== 'object') {
    throw new Error(
      'The Cloudflare API returned an invalid zone. Check DOMAIN and the token, and set CF_ZONE_ID and CF_ACCOUNT_ID manually in .env if needed.',
    );
  }

  const accountId = zone.account && typeof zone.account === 'object' ? zone.account.id : undefined;
  if (!zone.id || !accountId) {
    throw new Error(
      'The Cloudflare API returned no zone or account identifiers. Set CF_ZONE_ID and CF_ACCOUNT_ID manually in .env.',
    );
  }

  env.CF_ZONE_ID = zone.id;
  env.CF_ACCOUNT_ID = accountId;

  console.log(`Auto-configuration ready for ${domain}`);
}

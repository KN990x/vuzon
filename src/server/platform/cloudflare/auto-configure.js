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

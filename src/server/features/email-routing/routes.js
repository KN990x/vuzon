import { getPanelDomain } from '../../config/domain-env.js';
import { asyncHandler } from '../../bootstrap/async-handler.js';
import { createApiRateLimiter } from '../../platform/http/rate-limiters.js';
import {
  CATCH_ALL_MUTATION_CODE,
  CATCH_ALL_MUTATION_ERROR,
  isCatchAllRule,
  isCatchAllRuleId,
} from './catch-all-guard.js';
import {
  isSingleForwardRule,
  NOT_EDITABLE_RULE_CODE,
  NOT_EDITABLE_RULE_ERROR,
} from './single-forward-guard.js';
import { CloudflareApiError } from '../../platform/cloudflare/client.js';
import { ERROR_CODES } from '../../platform/http/error-codes.js';
import { PanelRequestError } from '../../platform/http/panel-request-error.js';
import { cloudflareRuleSchema } from '../../shared/cloudflare-schemas.js';
import {
  destinationInUseError,
  findRulesUsingDestination,
  ruleAliasLabel,
} from './destination-usage.js';
import {
  duplicateAliasError,
  hasRuleForAlias,
  inspectDestination,
  unknownDestinationError,
  unverifiedDestinationError,
} from './rule-diagnostics.js';
import {
  addressSchema,
  cloudflareResourceIdSchema,
  ruleSchema,
  ruleUpdateSchema,
} from './validation.js';

/**
 * Validated Cloudflare rule, or 502 when the response does not have the expected shape.
 * @param {unknown} rule
 * @returns {Record<string, unknown>}
 */
function parseCloudflareRule(rule) {
  const parsed = cloudflareRuleSchema.safeParse(rule);
  if (!parsed.success) {
    throw new CloudflareApiError('Cloudflare returned a rule with an unexpected shape', {
      status: 502,
      code: 'invalid_rule_shape',
      retryable: false,
    });
  }
  return parsed.data;
}

/**
 * PUT payload built from the existing rule: Cloudflare demands the full object, so we
 * send back the fields it already had and change only what was asked for.
 *
 * Unknown fields from a `.passthrough()` parse are preserved — a future Cloudflare
 * property must survive enable/disable. Known read-only / echo-only fields returned on
 * GET (`id`, `tag`, `created`, `modified`, `created_on`, `modified_on`) are stripped
 * because Cloudflare rejects or ignores them on PUT.
 * @param {Record<string, unknown>} rule Rule validated by `parseCloudflareRule`.
 * @param {boolean} enabled
 * @param {{ actions?: unknown[] }} [overrides] New `actions` (change destination).
 */
export function buildRuleUpdatePayload(rule, enabled, overrides = {}) {
  // Read-only / echo-only fields Cloudflare returns on GET but rejects or ignores on PUT.
  const readOnlyKeys = new Set(['id', 'tag', 'created', 'modified', 'created_on', 'modified_on']);
  const payload = { enabled };
  for (const [key, value] of Object.entries(rule)) {
    if (!readOnlyKeys.has(key)) {
      payload[key] = value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(overrides, 'actions')) {
    payload.actions = overrides.actions;
  }

  // `actions` is optional in cloudflareRuleSchema, so a response without it validates.
  // Sending `actions: undefined` would drop the key from the JSON anyway; being explicit
  // keeps the payload honest about what we are and are not changing.
  if (typeof payload.actions === 'undefined') {
    delete payload.actions;
  }

  return payload;
}

function rejectCatchAllMutation(res) {
  return res.status(400).json({
    error: CATCH_ALL_MUTATION_ERROR,
    code: CATCH_ALL_MUTATION_CODE,
  });
}

function rejectNotEditableRule(res) {
  return res.status(400).json({
    error: NOT_EDITABLE_RULE_ERROR,
    code: NOT_EDITABLE_RULE_CODE,
  });
}

/**
 * /api response contract (verified in tests/integration/server/app.test.js):
 *   - reads     → { result }
 *   - mutations → { ok: true }, plus `result` when Cloudflare returns the resource
 *   - errors    → { error, code, params? } with the matching HTTP status; `error` is an
 *                 English fallback and `code` is what the bilingual SPA renders
 *                 (platform/http/error-codes.js)
 * Exceptions (flat envelopes, no `{ result }`):
 *   - `GET /api/me` → `{ rootDomain }`
 *   - `/api/login` and `/api/logout` → `{ success: true }`
 */
export function registerApiRoutes(app, {
  env = process.env,
  requireAuth,
  cloudflareClient,
  apiLimiter = createApiRateLimiter(),
} = {}) {
  const { fetchCloudflare, fetchAllCloudflare } = cloudflareClient;
  // requireAuth BEFORE the limiter: requests without a session die at the 401 without
  // burning the shared quota (otherwise an anonymous client could exhaust it and lock
  // out the legitimate user; with TRUST_PROXY off every IP collapses into one).
  const gate = [requireAuth, apiLimiter];
  const updateRuleEnabledState = async (req, res, enabled) => {
    const ruleId = cloudflareResourceIdSchema.parse(req.params.id);
    if (isCatchAllRuleId(ruleId)) {
      return rejectCatchAllMutation(res);
    }

    const rule = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`);
    if (isCatchAllRule(rule)) {
      return rejectCatchAllMutation(res);
    }

    const payload = buildRuleUpdatePayload(parseCloudflareRule(rule), enabled);
    const apiRes = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`, 'PUT', payload);

    return res.json({ ok: true, result: apiRes });
  };

  // Flat envelope (not `{ result }`) — kept for the SPA `Profile` type.
  app.get('/api/me', ...gate, (_req, res) => {
    res.json({
      rootDomain: getPanelDomain(env),
    });
  });

  app.get('/api/addresses', ...gate, asyncHandler(async (req, res) => {
    const result = await fetchAllCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`);
    const mapped = result.map((address) => ({
      email: address.email,
      id: address.id,
      verified: address.verified,
    }));

    res.json({ result: mapped });
  }));

  app.post('/api/addresses', ...gate, asyncHandler(async (req, res) => {
    const body = addressSchema.parse(req.body);
    const apiRes = await fetchCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`, 'POST', {
      email: body.email,
    });

    res.json({ ok: true, result: apiRes });
  }));

  // Refuse to delete a destination still referenced by any rule (including catch-all).
  // Without this, aliases stay "active" in the panel while mail silently stops delivering.
  app.delete('/api/addresses/:id', ...gate, asyncHandler(async (req, res) => {
    const addressId = cloudflareResourceIdSchema.parse(req.params.id);

    const [addresses, rules, catchAll] = await Promise.all([
      fetchAllCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`),
      fetchAllCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`),
      fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/catch_all`).catch(() => {
        // Never delete blindly when catch-all usage cannot be verified.
        throw new PanelRequestError(
          'Could not verify whether this destination is still in use. Try again later.',
          { status: 502, code: ERROR_CODES.DEST_USAGE_CHECK_FAILED },
        );
      }),
    ]);

    const address = (Array.isArray(addresses) ? addresses : []).find(
      (entry) => entry && typeof entry === 'object' && entry.id === addressId,
    );
    if (address && typeof address.email === 'string' && address.email.trim() !== '') {
      const allRules = Array.isArray(rules) ? [...rules] : [];
      if (
        catchAll
        && typeof catchAll === 'object'
        && !allRules.some((rule) => rule && typeof rule === 'object' && rule.id === catchAll.id)
      ) {
        allRules.push(catchAll);
      }
      const using = findRulesUsingDestination(allRules, address.email);
      if (using.length > 0) {
        const aliases = [...new Set(using.map((rule) => ruleAliasLabel(rule)))];
        throw destinationInUseError(address.email, aliases);
      }
    }

    await fetchCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses/${addressId}`, 'DELETE');
    res.json({ ok: true });
  }));

  app.get('/api/rules', ...gate, asyncHandler(async (req, res) => {
    const rules = await fetchAllCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`);
    res.json({ result: rules });
  }));

  app.get('/api/rules/catch-all', ...gate, asyncHandler(async (req, res) => {
    const catchAll = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/catch_all`);
    res.json({ result: catchAll });
  }));

  /**
   * Translates a Cloudflare failure while creating an alias into an actionable message.
   * It only runs on the error branch, so the two extra calls do not make the happy path
   * more expensive. When no cause is identified, the original error is rethrown and the
   * client gets the usual generic message.
   * @returns {Promise<never>}
   */
  const diagnoseRuleCreationFailure = async ({ err, aliasEmail, destEmail }) => {
    const status = Number(err?.status);
    const isClientError = err instanceof CloudflareApiError
      && Number.isFinite(status)
      && status >= 400
      && status < 500
      && status !== 401
      && status !== 403;

    if (!isClientError) {
      throw err;
    }

    let addresses;
    let rules;
    try {
      [addresses, rules] = await Promise.all([
        fetchAllCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`),
        fetchAllCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`),
      ]);
    } catch {
      // Diagnostic fetches must not mask the original creation failure.
      throw err;
    }

    if (hasRuleForAlias(rules, aliasEmail)) {
      throw duplicateAliasError(aliasEmail);
    }

    const destination = inspectDestination(addresses, destEmail);
    if (!destination.exists) {
      throw unknownDestinationError(destEmail);
    }
    if (!destination.verified) {
      throw unverifiedDestinationError(destEmail);
    }

    throw err;
  };

  app.post('/api/rules', ...gate, asyncHandler(async (req, res) => {
    const { localPart, destEmail } = ruleSchema.parse(req.body);
    const aliasEmail = `${localPart}@${getPanelDomain(env)}`;

    // Pre-flight check: the SPA already offers verified destinations only, but the
    // server cannot trust the client, and this way the error arrives clear right away.
    //
    // The rules list is fetched here too, not only in the error branch: Cloudflare
    // ACCEPTS a duplicate matcher and answers 200, yet only the first rule processes the
    // mail (see rule-diagnostics.js). Diagnosing after the failure never sees that case,
    // so the user ended up with an alias that looks created and silently does nothing.
    // Both lists in parallel: the happy path costs one round trip, not two.
    const [addresses, rules] = await Promise.all([
      fetchAllCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`),
      fetchAllCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`),
    ]);

    if (hasRuleForAlias(rules, aliasEmail)) {
      throw duplicateAliasError(aliasEmail);
    }

    const destination = inspectDestination(addresses, destEmail);
    if (!destination.exists || !destination.email) {
      throw unknownDestinationError(destEmail);
    }
    if (!destination.verified) {
      throw unverifiedDestinationError(destEmail);
    }

    const payload = {
      name: aliasEmail,
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: aliasEmail }],
      actions: [{ type: 'forward', value: [destination.email] }],
    };

    let apiRes;
    try {
      apiRes = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`, 'POST', payload);
    } catch (err) {
      await diagnoseRuleCreationFailure({ err, aliasEmail, destEmail });
    }

    res.json({ ok: true, result: apiRes });
  }));

  // Change the destination of an existing alias. Same catch-all guard as
  // enable/disable/delete: the catch-all rule stays read-only.
  app.put('/api/rules/:id', ...gate, asyncHandler(async (req, res) => {
    const ruleId = cloudflareResourceIdSchema.parse(req.params.id);
    if (isCatchAllRuleId(ruleId)) {
      return rejectCatchAllMutation(res);
    }

    const { destEmail } = ruleUpdateSchema.parse(req.body);

    const addresses = await fetchAllCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`);
    const destination = inspectDestination(addresses, destEmail);
    if (!destination.exists || !destination.email) {
      throw unknownDestinationError(destEmail);
    }
    if (!destination.verified) {
      throw unverifiedDestinationError(destEmail);
    }

    const rule = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`);
    if (isCatchAllRule(rule)) {
      return rejectCatchAllMutation(res);
    }
    // Same shape of guarantee as the catch-all guard: this PUT replaces `actions`
    // wholesale, so anything that is not a plain single forward stays read-only here.
    if (!isSingleForwardRule(rule)) {
      return rejectNotEditableRule(res);
    }

    const parsedRule = parseCloudflareRule(rule);
    const payload = buildRuleUpdatePayload(parsedRule, parsedRule.enabled ?? true, {
      actions: [{ type: 'forward', value: [destination.email] }],
    });

    const apiRes = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`, 'PUT', payload);
    return res.json({ ok: true, result: apiRes });
  }));

  app.post('/api/rules/:id/enable', ...gate, asyncHandler(async (req, res) => {
    await updateRuleEnabledState(req, res, true);
  }));

  app.post('/api/rules/:id/disable', ...gate, asyncHandler(async (req, res) => {
    await updateRuleEnabledState(req, res, false);
  }));

  app.delete('/api/rules/:id', ...gate, asyncHandler(async (req, res) => {
    const ruleId = cloudflareResourceIdSchema.parse(req.params.id);
    if (isCatchAllRuleId(ruleId)) {
      return rejectCatchAllMutation(res);
    }

    const rule = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`);
    if (isCatchAllRule(rule)) {
      return rejectCatchAllMutation(res);
    }

    await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`, 'DELETE');
    return res.json({ ok: true });
  }));
}

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
  isPanelEditableRule,
  NOT_EDITABLE_RULE_CODE,
  NOT_EDITABLE_RULE_ERROR,
} from './rule-actions.js';
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
  resolvePanelAction,
  unknownDestinationError,
  unverifiedDestinationError,
} from './rule-diagnostics.js';
import {
  addressSchema,
  catchAllUpdateSchema,
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
 *
 * An override that is NOT passed leaves the rule's own value in place. That is what lets
 * a Worker rule be renamed or paused without the panel ever writing a `worker` action:
 * the request omits `action`, so `actions` travels back exactly as it arrived.
 * @param {Record<string, unknown>} rule Rule validated by `parseCloudflareRule`.
 * @param {boolean} enabled
 * @param {{ actions?: unknown[], name?: string }} [overrides]
 */
export function buildRuleUpdatePayload(rule, enabled, overrides = {}) {
  // Read-only / echo-only fields Cloudflare returns on GET but rejects or ignores on PUT.
  const readOnlyKeys = new Set(['id', 'tag', 'created', 'modified', 'created_on', 'modified_on']);
  const payload = {};
  for (const [key, value] of Object.entries(rule)) {
    if (!readOnlyKeys.has(key)) {
      payload[key] = value;
    }
  }

  // AFTER the copy, never before: `enabled` is one of the fields Cloudflare returns on
  // GET, so seeding the payload with it first meant the rule's current value overwrote
  // the one we were asked for — and `/enable` and `/disable` both sent the state back
  // unchanged.
  payload.enabled = enabled;

  if (Object.prototype.hasOwnProperty.call(overrides, 'actions')) {
    payload.actions = overrides.actions;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'name')) {
    payload.name = overrides.name;
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

  const listAddresses = () => fetchAllCloudflare(
    `/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`,
  );

  /**
   * Validated panel action → Cloudflare action. The address list is only fetched for a
   * `forward`: dropping mail needs no destination, so it costs no round trip.
   */
  const resolveAction = async (action) => (
    action.type === 'drop'
      ? resolvePanelAction(action, [])
      : resolvePanelAction(action, await listAddresses())
  );

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
      listAddresses(),
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
  const diagnoseRuleCreationFailure = async ({ err, aliasEmail, action }) => {
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
        listAddresses(),
        fetchAllCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`),
      ]);
    } catch {
      // Diagnostic fetches must not mask the original creation failure.
      throw err;
    }

    if (hasRuleForAlias(rules, aliasEmail)) {
      throw duplicateAliasError(aliasEmail);
    }

    // A `drop` rule has no destination to blame, so the address checks are skipped and
    // the original Cloudflare failure stands.
    if (action.type === 'forward') {
      for (const destEmail of action.value) {
        const destination = inspectDestination(addresses, destEmail);
        if (!destination.exists) {
          throw unknownDestinationError(destEmail);
        }
        if (!destination.verified) {
          throw unverifiedDestinationError(destEmail);
        }
      }
    }

    throw err;
  };

  app.post('/api/rules', ...gate, asyncHandler(async (req, res) => {
    const { localPart, action } = ruleSchema.parse(req.body);
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
      action.type === 'forward' ? listAddresses() : [],
      fetchAllCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`),
    ]);

    if (hasRuleForAlias(rules, aliasEmail)) {
      throw duplicateAliasError(aliasEmail);
    }

    const payload = {
      name: aliasEmail,
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: aliasEmail }],
      actions: [resolvePanelAction(action, addresses)],
    };

    let apiRes;
    try {
      apiRes = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`, 'POST', payload);
    } catch (err) {
      await diagnoseRuleCreationFailure({ err, aliasEmail, action });
    }

    res.json({ ok: true, result: apiRes });
  }));

  /**
   * The ONLY way the catch-all reaches Cloudflare (see catch-all-guard.js).
   *
   * MUST stay registered before `PUT /api/rules/:id`: `cloudflareResourceIdSchema`
   * accepts hyphens, so the parametrised route would happily swallow `catch-all` and
   * ask Cloudflare for a rule that does not exist.
   *
   * `matchers` is forced here and never read from the request — `all` is the only shape
   * Cloudflare accepts in this slot, and a catch-all that stopped catching everything
   * would silently blackhole mail. Omitting `action` preserves whatever is configured,
   * which is what makes a pure enable/disable safe on a Worker-backed catch-all.
   */
  app.put('/api/rules/catch-all', ...gate, asyncHandler(async (req, res) => {
    const { action, enabled } = catchAllUpdateSchema.parse(req.body);

    const catchAll = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/catch_all`);
    const parsedRule = parseCloudflareRule(catchAll);

    const overrides = {};
    if (action !== undefined) {
      overrides.actions = [await resolveAction(action)];
    }

    const payload = buildRuleUpdatePayload(parsedRule, enabled ?? parsedRule.enabled ?? true, overrides);
    payload.matchers = [{ type: 'all' }];

    const apiRes = await fetchCloudflare(
      `/zones/${env.CF_ZONE_ID}/email/routing/rules/catch_all`,
      'PUT',
      payload,
    );
    return res.json({ ok: true, result: apiRes });
  }));

  // Edit an existing alias: its action, its name, or whether it is enabled. Same
  // catch-all guard as enable/disable/delete — the fallback rule has its own endpoint.
  app.put('/api/rules/:id', ...gate, asyncHandler(async (req, res) => {
    const ruleId = cloudflareResourceIdSchema.parse(req.params.id);
    if (isCatchAllRuleId(ruleId)) {
      return rejectCatchAllMutation(res);
    }

    const { action, name, enabled } = ruleUpdateSchema.parse(req.body);

    const rule = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`);
    if (isCatchAllRule(rule)) {
      return rejectCatchAllMutation(res);
    }
    // Same shape of guarantee as the catch-all guard: this PUT replaces `actions`
    // wholesale, so a rule whose current action the panel cannot even describe is never
    // rewritten — that is how configuration made outside vuzon survives.
    if (!isPanelEditableRule(rule)) {
      return rejectNotEditableRule(res);
    }

    const overrides = {};
    if (action !== undefined) {
      overrides.actions = [await resolveAction(action)];
    }
    if (name !== undefined) {
      overrides.name = name;
    }

    const parsedRule = parseCloudflareRule(rule);
    const payload = buildRuleUpdatePayload(parsedRule, enabled ?? parsedRule.enabled ?? true, overrides);

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

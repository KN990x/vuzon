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
  countRulesForAlias,
  duplicateAliasError,
  duplicateDestinationError,
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
 * property must survive enable/disable. The read-only / echo-only fields returned on GET
 * are stripped because Cloudflare rejects or ignores them on PUT; `readOnlyKeys` below is
 * the list (keep it and this sentence in sync rather than restating it here).
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
  const readOnlyKeys = new Set([
    'id',
    'tag',
    'created',
    'modified',
    'created_on',
    'modified_on',
    'zone',
    'zone_id',
    'zone_name',
  ]);
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
 *   - `GET /api/me` → `{ rootDomain, username }`
 *   - `/api/login` and `/api/logout` → `{ success: true }`
 */
export function registerApiRoutes(app, {
  env = process.env,
  requireAuth,
  credentialStore,
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
    // Same guard as PUT: an undescribable action must not be rewritten, even for a
    // pure enable/disable — buildRuleUpdatePayload still sends the full object back.
    if (!isPanelEditableRule(rule)) {
      return rejectNotEditableRule(res);
    }

    const payload = buildRuleUpdatePayload(parseCloudflareRule(rule), enabled);
    const apiRes = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`, 'PUT', payload);

    return res.json({ ok: true, result: apiRes });
  };

  // Flat envelope (not `{ result }`) — kept for the SPA `Profile` type.
  app.get('/api/me', ...gate, (_req, res) => {
    res.json({
      rootDomain: getPanelDomain(env),
      username: credentialStore.getUsername(),
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

    // Diagnostic parity with POST /api/rules. Cloudflare rejects a duplicate destination
    // with a generic 4xx, which reached the user as `cloudflare.generic` — "Could not
    // complete the operation with Cloudflare", for something whose actual answer is "it is
    // already in your list". Checked on the ERROR branch only, so the happy path still
    // costs exactly one round trip.
    let apiRes;
    try {
      apiRes = await fetchCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`, 'POST', {
        email: body.email,
      });
    } catch (err) {
      const status = Number(err?.status);
      const diagnosable = err instanceof CloudflareApiError
        && Number.isFinite(status)
        && status >= 400
        && status < 500
        // Same exclusions as diagnoseRuleCreationFailure: a bad token or a throttled
        // account says nothing about the address, and re-listing while rate-limited only
        // spends more quota.
        && ![401, 403, 408, 429].includes(status);

      if (diagnosable) {
        // A failure here must not mask the original error.
        const addresses = await listAddresses().catch(() => null);
        if (addresses && inspectDestination(addresses, body.email).exists) {
          throw duplicateDestinationError(body.email);
        }
      }
      throw err;
    }

    res.json({ ok: true, result: apiRes });
  }));

  // Refuse to delete a destination still referenced by any rule (including catch-all).
  // Without this, aliases stay "active" in the panel while mail silently stops delivering.
  app.delete('/api/addresses/:id', ...gate, asyncHandler(async (req, res) => {
    const addressId = cloudflareResourceIdSchema.parse(req.params.id);

    // All three fetches share one failure meaning — "usage could not be verified" — so they
    // share one error. Only the catch-all leg used to be mapped: a failure of the rules or
    // addresses listing propagated as the generic `cloudflare.generic`, which rendered a
    // different message to the user for the identical condition. The DELETE is skipped
    // either way; what differed was only what the panel said about why.
    const usageCheckFailed = () => new PanelRequestError(
      'Could not verify whether this destination is still in use. Try again later.',
      { status: 502, code: ERROR_CODES.DEST_USAGE_CHECK_FAILED },
    );

    const [addresses, rules, catchAll] = await Promise.all([
      listAddresses(),
      fetchAllCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`),
      fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/catch_all`),
    ]).catch(() => {
      // Never delete blindly when usage cannot be verified.
      throw usageCheckFailed();
    });

    // A list that did not come back as a list means the check could not run at all.
    // Same for rules: treating a non-array as [] would skip every alias and look like
    // the destination was unused — fail closed, like the addresses listing above.
    if (!Array.isArray(addresses) || !Array.isArray(rules)) {
      throw usageCheckFailed();
    }

    const address = addresses.find(
      (entry) => entry && typeof entry === 'object' && entry.id === addressId,
    );
    // The listing succeeded and the id is not in it: the destination is already gone
    // (deleted from another tab, or from Cloudflare's own panel). 404, not 502 — a
    // "try again later" is misleading advice for something retrying can never fix.
    if (!address) {
      throw new PanelRequestError(
        'That destination no longer exists. Refresh the panel.',
        { status: 404, code: ERROR_CODES.DEST_NOT_FOUND },
      );
    }

    // Fail closed: never DELETE when the destination email cannot be resolved —
    // skipping the usage scan would let aliases keep looking "active" while mail
    // silently stops delivering (same trust model as the catch-all check above).
    if (typeof address.email !== 'string' || address.email.trim() === '') {
      throw usageCheckFailed();
    }

    const allRules = [...rules];
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
    // 401/403 mean the token is wrong, not the request. 408/429 mean Cloudflare is
    // throttling or timing out: nothing about the payload is diagnosable, and the two
    // fetches below are GETs that `client.js` retries twice more on 429 — six extra calls
    // and roughly a second of backoff while already rate-limited, only to fall through to
    // the generic message anyway. Everything else in the 4xx range is worth inspecting.
    const isDiagnosableClientError = err instanceof CloudflareApiError
      && Number.isFinite(status)
      && status >= 400
      && status < 500
      && status !== 401
      && status !== 403
      && status !== 408
      && status !== 429;

    if (!isDiagnosableClientError) {
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

  /**
   * Serialises creates so two concurrent POSTs for the same alias cannot both pass the
   * pre-flight check. The post-create recount below still covers races that slip past
   * (another replica, or a matcher Cloudflare already held outside this window).
   *
   * Keyed BY ALIAS, not global. A single queue meant one slow create blocked every other
   * one: `client.js` can spend 3 x 10s plus backoff on a stalled GET, and Express sets no
   * request timeout, so a single hung upstream call held up creates for unrelated aliases
   * for roughly half a minute each. Two different aliases have no reason to wait for each
   * other — the check they race on is per-matcher.
   *
   * The map entry is dropped once its tail settles, so it cannot grow with every alias
   * ever created.
   */
  const createRuleTails = new Map();
  const withCreateRuleLock = (aliasEmail, run) => {
    const previous = createRuleTails.get(aliasEmail) ?? Promise.resolve();
    const next = previous.then(run, run);
    const tail = next.then(() => undefined, () => undefined);
    createRuleTails.set(aliasEmail, tail);
    void tail.then(() => {
      // Only if nothing queued behind us in the meantime.
      if (createRuleTails.get(aliasEmail) === tail) {
        createRuleTails.delete(aliasEmail);
      }
    });
    return next;
  };

  app.post('/api/rules', ...gate, asyncHandler(async (req, res) => {
    // Parsed BEFORE the lock: the alias is the lock key, and a malformed body should fail
    // validation immediately rather than queueing behind someone else's create.
    const { localPart, action } = ruleSchema.parse(req.body);
    const aliasEmail = `${localPart}@${getPanelDomain(env)}`;

    await withCreateRuleLock(aliasEmail, async () => {
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

      // Post-create recount: if another rule for the same matcher appeared (race across
      // processes, or Cloudflare already had a twin), roll back ours and surface the same
      // duplicate error the pre-check would have — never leave a silent blackhole.
      const rulesAfter = await fetchAllCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`);
      if (countRulesForAlias(rulesAfter, aliasEmail) > 1) {
        const createdId = typeof apiRes?.id === 'string' ? apiRes.id : null;
        if (createdId) {
          try {
            await fetchCloudflare(
              `/zones/${env.CF_ZONE_ID}/email/routing/rules/${createdId}`,
              'DELETE',
            );
          } catch {
            // Best-effort rollback; the duplicate error below still tells the user.
          }
        }
        throw duplicateAliasError(aliasEmail);
      }

      res.json({ ok: true, result: apiRes });
    });
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

    // NO `isPanelEditableRule` guard here, unlike PUT and enable/disable.
    //
    // That guard exists because `buildRuleUpdatePayload` replaces `actions` wholesale: the
    // panel must not hand back an action it failed to understand, because it would be
    // rewriting something it cannot reconstruct. Deleting reconstructs nothing, so the
    // reason does not carry over.
    //
    // Applying it here had a real cost: a rule with no actions at all, or with two, is
    // `unknown`, so it could not be removed from the panel AT ALL — the user had to go to
    // Cloudflare's own dashboard to clean up a rule vuzon itself was showing them. The
    // alias is visible in the row either way, so "delete this alias" is a comprehensible
    // action even when the panel cannot describe what the alias currently does; the SPA
    // says exactly that in the confirmation before getting here.
    await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`, 'DELETE');
    return res.json({ ok: true });
  }));
}

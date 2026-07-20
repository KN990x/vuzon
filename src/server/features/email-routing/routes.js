import { getPanelDomain } from '../../config/domain-env.js';
import { getPanelAuthCredentials } from '../../config/panel-auth-env.js';
import { asyncHandler } from '../../bootstrap/async-handler.js';
import { createApiRateLimiter } from '../../platform/http/rate-limiters.js';
import {
  CATCH_ALL_MUTATION_ERROR,
  isCatchAllRule,
  isCatchAllRuleId,
} from './catch-all-guard.js';
import { CloudflareApiError } from '../../platform/cloudflare/client.js';
import { cloudflareRuleSchema } from '../../shared/cloudflare-schemas.js';
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
 * Regla de Cloudflare validada, o 502 si la respuesta no tiene la forma esperada.
 * @param {unknown} rule
 * @returns {Record<string, unknown>}
 */
function parseCloudflareRule(rule) {
  const parsed = cloudflareRuleSchema.safeParse(rule);
  if (!parsed.success) {
    throw new CloudflareApiError('Cloudflare devolvió una regla con forma inesperada', {
      status: 502,
      code: 'invalid_rule_shape',
      retryable: false,
    });
  }
  return parsed.data;
}

/**
 * Payload de PUT a partir de la regla existente: Cloudflare exige el objeto completo,
 * así que se reenvían los campos que ya tenía y solo se cambia lo pedido.
 * @param {Record<string, unknown>} rule Regla validada por `parseCloudflareRule`.
 * @param {boolean} enabled
 * @param {{ actions?: unknown[] }} [overrides] `actions` nuevas (cambiar destino).
 */
export function buildRuleUpdatePayload(rule, enabled, overrides = {}) {
  const payload = {
    name: rule.name,
    enabled,
    matchers: rule.matchers,
    actions: overrides.actions ?? rule.actions,
  };

  if (typeof rule.priority !== 'undefined') {
    payload.priority = rule.priority;
  }
  if (typeof rule.source === 'string' && rule.source.length > 0) {
    payload.source = rule.source;
  }
  if (typeof rule.owner_worker_tag === 'string' && rule.owner_worker_tag.length > 0) {
    payload.owner_worker_tag = rule.owner_worker_tag;
  }

  return payload;
}

function rejectCatchAllMutation(res) {
  return res.status(400).json({ error: CATCH_ALL_MUTATION_ERROR });
}

/**
 * Contrato de respuesta de /api (verificado en tests/integration/server/app.test.js):
 *   - lecturas  → { result }
 *   - mutaciones→ { ok: true } y además `result` cuando Cloudflare devuelve el recurso
 *   - errores   → { error } con el status HTTP correspondiente
 * `/api/login` y `/api/logout` mantienen su propio `{ success: true }`.
 */
export function registerApiRoutes(app, {
  env = process.env,
  requireAuth,
  cloudflareClient,
  apiLimiter = createApiRateLimiter(),
} = {}) {
  const { fetchCloudflare, fetchAllCloudflare } = cloudflareClient;
  // requireAuth ANTES del limiter: las peticiones sin sesión mueren en el 401 sin
  // consumir la cuota compartida (si no, un cliente anónimo podría agotarla y
  // bloquear al usuario legítimo; con TRUST_PROXY off todas las IPs colapsan).
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

  app.get('/api/me', ...gate, (req, res) => {
    const { authUser } = getPanelAuthCredentials(env);
    res.json({
      email: authUser || 'admin',
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

  app.delete('/api/addresses/:id', ...gate, asyncHandler(async (req, res) => {
    const addressId = cloudflareResourceIdSchema.parse(req.params.id);
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
   * Traduce un fallo de Cloudflare al crear un alias en un mensaje accionable.
   * Solo se ejecuta en la rama de error, así que las dos llamadas extra no encarecen
   * el camino feliz. Si no se identifica la causa, se relanza el error original y el
   * cliente recibe el mensaje genérico de siempre.
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

    const [addresses, rules] = await Promise.all([
      fetchAllCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`),
      fetchAllCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`),
    ]);

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

    // Comprobación preventiva: la SPA ya solo ofrece destinos verificados, pero el
    // servidor no puede fiarse del cliente y así el error llega claro de una vez.
    const addresses = await fetchAllCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`);
    const destination = inspectDestination(addresses, destEmail);
    if (!destination.exists) {
      throw unknownDestinationError(destEmail);
    }
    if (!destination.verified) {
      throw unverifiedDestinationError(destEmail);
    }

    const payload = {
      name: aliasEmail,
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: aliasEmail }],
      actions: [{ type: 'forward', value: [destEmail] }],
    };

    let apiRes;
    try {
      apiRes = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules`, 'POST', payload);
    } catch (err) {
      await diagnoseRuleCreationFailure({ err, aliasEmail, destEmail });
    }

    res.json({ ok: true, result: apiRes });
  }));

  // Cambiar el destino de un alias existente. Mismo guard de catch-all que
  // enable/disable/delete: la regla catch-all sigue siendo de solo lectura.
  app.put('/api/rules/:id', ...gate, asyncHandler(async (req, res) => {
    const ruleId = cloudflareResourceIdSchema.parse(req.params.id);
    if (isCatchAllRuleId(ruleId)) {
      return rejectCatchAllMutation(res);
    }

    const { destEmail } = ruleUpdateSchema.parse(req.body);

    const addresses = await fetchAllCloudflare(`/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses`);
    const destination = inspectDestination(addresses, destEmail);
    if (!destination.exists) {
      throw unknownDestinationError(destEmail);
    }
    if (!destination.verified) {
      throw unverifiedDestinationError(destEmail);
    }

    const rule = await fetchCloudflare(`/zones/${env.CF_ZONE_ID}/email/routing/rules/${ruleId}`);
    if (isCatchAllRule(rule)) {
      return rejectCatchAllMutation(res);
    }

    const parsedRule = parseCloudflareRule(rule);
    const payload = buildRuleUpdatePayload(parsedRule, parsedRule.enabled ?? true, {
      actions: [{ type: 'forward', value: [destEmail] }],
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

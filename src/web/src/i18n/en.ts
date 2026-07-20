/**
 * English catalogue — the SOURCE OF TRUTH for every string the user reads.
 *
 * `es.ts` is typed against this object (`satisfies Messages`), so a key added here and
 * forgotten there is a compile error, not a blank label at runtime. That compile-time
 * guarantee is why the panel carries no i18n library: the bundle budget is deliberate
 * (see AGENTS.md).
 *
 * Placeholders are `{name}` and are filled by `interpolate` in locale.ts.
 * Keys ending in `.one` / `.other` are plural forms resolved by `tn`.
 */
export const en = {
  'app.loading': 'Loading…',
  'app.sessionCheckFailed': 'Could not check the session. Check the connection to the server.',
  'app.retry': 'Retry',

  'header.badge': 'Panel',
  'header.refresh': 'Refresh',
  'header.logout': 'Sign out',
  'header.github': 'GitHub',
  'header.language': 'Language',
  'header.languageCurrent': 'Language: {language}',

  'language.en': 'English',
  'language.es': 'Español',

  'login.subtitle': 'Routing panel',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.error.generic': 'Could not sign in',
  'login.error.server': 'Server error. Please try again.',
  'login.error.http': 'Could not sign in (HTTP {status})',
  'login.error.network': 'Could not reach the server. Check your connection.',

  'dashboard.eyebrow': 'Routing panel',
  'dashboard.activeAliases': 'active aliases',
  'dashboard.catchAll': 'catch-all',
  'dashboard.resource.rules': 'rules',
  'dashboard.resource.addresses': 'destinations',
  'dashboard.resource.catchAll': 'catch-all',
  'dashboard.status.partialLoad': 'Partial load: {details}',
  'dashboard.status.profileError': 'profile: {message}',
  'dashboard.status.error': 'Error: {message}',
  'dashboard.status.aliasCreated': 'Alias created',
  'dashboard.status.aliasUpdated': 'Alias updated',
  'dashboard.status.aliasDeleted': 'Alias deleted',
  'dashboard.status.destUpdated': 'Destination updated',
  'dashboard.status.destAdded': 'Added. Check your inbox to verify it.',
  'dashboard.status.destDeleted': 'Destination deleted',
  'dashboard.status.copyFailed': 'Could not copy (are you using HTTPS?)',
  'dashboard.confirm.deleteAlias': 'Delete this alias permanently?',
  'dashboard.confirm.deleteDest':
    'Delete this destination? Any rules using it will stop working.',
  'dashboard.confirm.deleteDestInUse':
    'This destination is used by: {aliases}. Remove or re-point those rules before deleting it.',
  'dashboard.copyPrompt': 'Copy your alias manually:',

  'aliases.title': 'Aliases',
  'aliases.search.placeholder': 'search alias',
  'aliases.search.label': 'Search aliases',
  'aliases.count.one': '{count} rule',
  'aliases.count.other': '{count} rules',
  'aliases.empty.noResults': 'No aliases found.',
  'aliases.empty.onlyCatchAll': 'No custom aliases; only the catch-all applies.',
  'aliases.empty.none': 'No aliases created yet.',
  'aliases.row.fallbackName': 'alias',
  'aliases.row.destLabel': 'Destination of {alias}',
  'aliases.row.active': 'active',
  'aliases.row.paused': 'paused',
  'aliases.row.pause': 'Pause alias',
  'aliases.row.enable': 'Enable alias',
  'aliases.row.delete': 'Delete alias',
  'aliases.row.deleteNamed': 'Delete {alias}',
  'aliases.new.placeholder': 'new-alias',
  'aliases.new.label': 'Local part of the new alias',
  'aliases.new.generate': 'Generate a random alias',
  'aliases.new.copy': 'Copy {address}',
  'aliases.new.destLabel': 'Destination of the new alias',
  'aliases.new.noVerifiedDests': 'no verified destinations',
  'aliases.new.submit': 'Add alias',

  'dests.title': 'Verified destinations',
  'dests.verified': 'Verified',
  'dests.pending': 'Pending',
  'dests.delete': 'Delete destination',
  'dests.deleteNamed': 'Delete {email}',
  'dests.empty': 'No destinations yet.',
  'dests.new.placeholder': 'you@email.com',
  'dests.new.label': 'New destination',
  'dests.new.submit': 'Add',

  'catchAll.title': 'Catch-all',
  'catchAll.state.unavailable': 'unavailable',
  'catchAll.state.active': 'active',
  'catchAll.state.paused': 'paused',
  'catchAll.description':
    'Any mail sent to an address without an alias is forwarded to the default destination. '
    + 'This rule is managed from Cloudflare and is read-only here.',
  'catchAll.loadError': 'Could not load the catch-all rule',
  'catchAll.noAction': 'No action configured',

  'footer.coffee': 'Buy me a coffee',

  // How a rule's action is rendered in the list (see lib/rules.ts).
  'rule.action.drop': 'Discard',
  'rule.action.worker': 'Worker: {value}',
  'rule.action.workerDefault': 'Email Worker',

  // Server error codes (platform/http/error-codes.js) and the two the client raises
  // itself. Every code MUST have an entry: tests/architecture/error-codes-guard.test.js
  // fails CI otherwise.
  'error.unknown': 'Something went wrong',
  'error.auth.credentials_missing':
    'Server credentials are not configured (AUTH_USER/AUTH_PASS)',
  'error.auth.invalid_credentials': 'Invalid credentials',
  'error.auth.unauthorized': 'Session expired',
  'error.rate_limit.login': 'Too many attempts. Wait a moment and try again.',
  'error.rate_limit.api': 'Too many requests. Wait a moment and try again.',
  'error.validation.invalid': 'Invalid data',
  'error.request.malformed': 'The request body is not valid JSON.',
  'error.request.too_large': 'The request body is too large.',
  'error.rules.catch_all_readonly':
    'The catch-all rule cannot be modified or deleted from this API.',
  'error.rules.not_editable':
    'This rule does not forward to a single address and cannot be edited from the panel.',
  'error.rules.duplicate_alias': 'The alias {alias} already exists.',
  'error.dest.unknown':
    '{email} is not in the account\'s destination list. Add it as a destination first.',
  'error.dest.unverified':
    'The destination {email} is not verified in Cloudflare. '
    + 'Check its inbox and confirm the address before creating the alias.',
  'error.dest.in_use':
    'Cannot delete {email}: it is still used by {aliases}. '
    + 'Remove or re-point those rules first.',
  'error.cloudflare.generic':
    'Could not complete the operation with Cloudflare. Check the configuration or try again later.',
  'error.server.internal': 'Internal server error',
  'error.server.not_found': 'Not found',
  'error.client.non_json': 'Unexpected response from the server (HTTP {status})',
  'error.client.invalid_json': 'Invalid JSON response from the server (HTTP {status})',

  // Field labels and per-issue slugs of a `validation.invalid` response.
  'error.field.email': 'Email',
  'error.field.localPart': 'Alias',
  'error.field.destEmail': 'Destination email',
  'error.field.username': 'Username',
  'error.field.password': 'Password',
  'error.issue.email.invalid': 'invalid email format',
  'error.issue.alias.empty': 'the alias cannot be empty',
  'error.issue.alias.too_long': 'the alias is too long',
  'error.issue.alias.charset':
    'only lowercase letters, digits, dots, underscores and hyphens; must start and end with a letter or digit; no consecutive separators',
  'error.issue.dest_email.invalid': 'invalid destination email',
  'error.issue.username.required': 'username required',
  'error.issue.username.invalid': 'invalid username',
  'error.issue.username.too_long': 'username too long',
  'error.issue.password.required': 'password required',
  'error.issue.password.invalid': 'invalid password',
  'error.issue.password.too_long': 'password too long',
  'error.issue.id.empty': 'invalid identifier',
  'error.issue.id.too_long': 'identifier too long',
  'error.issue.id.charset': 'identifier contains characters that are not allowed',
};

export type Messages = typeof en;
export type MessageKey = keyof Messages;

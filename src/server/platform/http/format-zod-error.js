/**
 * Zod issues → the `{ error, code, params }` envelope.
 *
 * The `message` of every panel schema is a STABLE SLUG (`alias.charset`), not prose:
 * the text the user reads is chosen by the browser from `src/web/src/i18n/`. Here the
 * slug is turned into the English fallback that travels in `error`, and the slug list
 * itself travels in `params.issues` so the SPA can translate issue by issue.
 */

const FIELD_LABELS = {
  email: 'Email',
  localPart: 'Alias',
  action: 'Action',
  name: 'Name',
  username: 'Username',
  password: 'Password',
  passwordConfirm: 'Password confirmation',
  currentPassword: 'Current password',
  newPassword: 'New password',
  newPasswordConfirm: 'New password confirmation',
};

/**
 * English fallback for each slug. A message missing from this table (zod's own
 * built-ins, for instance) travels as-is: those are English too.
 */
const ISSUE_MESSAGES = {
  'email.invalid': 'invalid email format',
  'alias.empty': 'the alias cannot be empty',
  'alias.too_long': 'the alias is too long',
  'alias.charset':
    'only lowercase letters, digits, dots, underscores and hyphens; must start and end with a letter or digit; no consecutive separators',
  'dest_email.invalid': 'invalid destination email',
  'action.type': 'the action must be "forward" or "drop"',
  'action.forward_single': 'a forward action takes exactly one destination address',
  'rule_name.empty': 'the name cannot be empty',
  'rule_name.too_long': 'the name is too long',
  'rule_update.empty': 'nothing to update: send an action, a name or an enabled flag',
  'username.required': 'username required',
  'username.invalid': 'invalid username',
  'username.too_long': 'username too long',
  'password.required': 'password required',
  'password.invalid': 'invalid password',
  'password.too_long': 'password too long',
  'password.too_short': 'the password is too short',
  'password.mismatch': 'the two passwords do not match',
  'password.current_required': 'current password required',
  'id.empty': 'invalid identifier',
  'id.too_long': 'identifier too long',
  'id.charset': 'identifier contains characters that are not allowed',
};

const GENERIC_VALIDATION_MESSAGE = 'Invalid data';

/**
 * @param {unknown} error
 * @returns {Array<{ field: string, code: string }>}
 */
export function collectZodIssues(error) {
  if (!Array.isArray(error?.issues)) {
    return [];
  }

  return error.issues.map((issue) => {
    const field = issue.path?.[0];
    return {
      field: typeof field === 'string' ? field : '',
      code: typeof issue.message === 'string' ? issue.message : '',
    };
  });
}

/**
 * English sentence for the `error` fallback.
 * @param {unknown} error
 * @returns {string}
 */
export function formatZodError(error) {
  const issues = collectZodIssues(error);
  if (issues.length === 0) {
    return GENERIC_VALIDATION_MESSAGE;
  }

  return issues.map(({ field, code }) => {
    const label = field ? FIELD_LABELS[field] || field : '';
    const text = ISSUE_MESSAGES[code] || code;
    return label ? `${label}: ${text}` : text;
  }).join('. ');
}

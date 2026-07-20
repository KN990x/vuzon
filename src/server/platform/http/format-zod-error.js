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
  destEmail: 'Destination email',
  username: 'Username',
  password: 'Password',
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
    'only lowercase letters, digits, dots and hyphens; it must start and end with a letter or digit',
  'dest_email.invalid': 'invalid destination email',
  'username.required': 'username required',
  'username.invalid': 'invalid username',
  'username.too_long': 'username too long',
  'password.required': 'password required',
  'password.invalid': 'invalid password',
  'password.too_long': 'password too long',
  'id.empty': 'invalid identifier',
  'id.too_long': 'identifier too long',
  'id.charset': 'identifier contains characters that are not allowed',
};

export const GENERIC_VALIDATION_MESSAGE = 'Invalid data';

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

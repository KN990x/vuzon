/**
 * Client-side check for a password the user is CHOOSING (setup wizard, password change).
 *
 * It mirrors `src/server/features/auth/setup-body.js`, which stays the authority — nothing
 * here is a security boundary. It exists so the two most common mistakes (a short password,
 * a confirmation that does not match) are answered instantly instead of after a round-trip
 * that runs a deliberately slow KDF.
 *
 * It returns the server's own issue SLUGS, not copy, so both paths end up rendering the
 * same sentence from the catalogue (`error.issue.*`).
 */

/** Keep in step with `MIN_PASSWORD_LENGTH` in `setup-body.js`. */
export const MIN_PASSWORD_LENGTH = 12;

export type PasswordIssue = 'password.required' | 'password.too_short' | 'password.mismatch';

/**
 * Trimmed like the server schema: what the panel validates has to be what the panel stores.
 */
export function checkNewPassword(password: string, confirmation: string): PasswordIssue | null {
  const chosen = password.trim();

  if (chosen.length === 0) {
    return 'password.required';
  }
  if (chosen.length < MIN_PASSWORD_LENGTH) {
    return 'password.too_short';
  }
  if (chosen !== confirmation.trim()) {
    return 'password.mismatch';
  }

  return null;
}

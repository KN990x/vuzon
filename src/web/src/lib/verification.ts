/**
 * Shapes Cloudflare has returned (or may return) for destination verification.
 * Keep in lockstep with `isVerifiedAddress` in rule-diagnostics.js — both sides
 * are checked against src/shared/verified-status-cases.json.
 */
const POSITIVE_VERIFICATION_STRINGS = new Set([
  'true',
  '1',
  'yes',
  'verified',
  'active',
  'enabled',
]);

const ISO_TIMESTAMP_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoTimestampString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (!ISO_TIMESTAMP_REGEX.test(trimmed)) {
    return false;
  }

  return !Number.isNaN(Date.parse(trimmed));
}

export function isVerifiedStatus(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();

    if (POSITIVE_VERIFICATION_STRINGS.has(normalized)) {
      return true;
    }

    if (isIsoTimestampString(value)) {
      return true;
    }
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as { status?: unknown; verification_status?: unknown };
    if (obj.status === 'verified') {
      return true;
    }

    if (obj.verification_status === 'active') {
      return true;
    }
  }

  return false;
}

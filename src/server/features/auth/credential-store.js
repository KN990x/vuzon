import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { timingSafeStringEqual } from './safe-string-equal.js';

/**
 * The panel's own credentials, on disk.
 *
 * Until v2 they lived in `.env` as `AUTH_USER` / `AUTH_PASS`: readable by anyone with
 * access to the host or to `docker inspect`, impossible to change without editing a file
 * and restarting. Now the first visit runs a setup wizard and this module keeps the result
 * as a scrypt hash inside the data directory.
 *
 * scrypt comes from `node:crypto`: argon2/bcrypt would add a native dependency and
 * complicate the multi-arch image built by GitHub Actions, for a single-user homelab panel
 * whose login is already rate limited.
 */

const scrypt = promisify(crypto.scrypt);

const AUTH_FILE_NAME = 'auth.json';
const RECORD_VERSION = 1;

/** Owner-only: the file is a password hash. */
const FILE_MODE = 0o600;

/**
 * Current KDF parameters. They are written into the record, so raising them later only
 * affects passwords saved from then on — an existing `auth.json` keeps verifying with the
 * parameters it was created with instead of locking the user out.
 */
const SCRYPT_PARAMS = Object.freeze({
  algo: 'scrypt',
  N: 2 ** 15,
  r: 8,
  p: 1,
  keylen: 64,
});

const SALT_BYTES = 16;

/**
 * Node throws when `128 * N * r` exceeds `maxmem`, and the default (32 MiB) sits exactly on
 * the boundary for the parameters above. Derive it instead of hard-coding a number that a
 * future parameter bump would silently break.
 * @param {{ N: number, r: number }} params
 */
function maxmemFor({ N, r }) {
  return 128 * N * r * 2;
}

const passwordRecordSchema = z.object({
  algo: z.literal('scrypt'),
  N: z.number().int().positive(),
  r: z.number().int().positive(),
  p: z.number().int().positive(),
  keylen: z.number().int().positive(),
  salt: z.string().min(1),
  hash: z.string().min(1),
});

const authRecordSchema = z.object({
  version: z.literal(RECORD_VERSION),
  username: z.string().trim().min(1),
  password: passwordRecordSchema,
  updatedAt: z.string().optional(),
});

/**
 * Record used when there is nothing to compare against (no credentials yet, or an unknown
 * username). Verifying against it costs the same as a real check, so response time does not
 * reveal whether the username exists.
 */
const DECOY_RECORD = Object.freeze({
  ...SCRYPT_PARAMS,
  salt: Buffer.alloc(SALT_BYTES).toString('base64'),
  hash: Buffer.alloc(SCRYPT_PARAMS.keylen).toString('base64'),
});

/**
 * @param {string} password
 * @param {{ N: number, r: number, p: number, keylen: number, salt: string }} params
 * @returns {Promise<Buffer>}
 */
async function deriveKey(password, params) {
  return scrypt(password, Buffer.from(params.salt, 'base64'), params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmemFor(params),
  });
}

/**
 * @param {string} password
 * @returns {Promise<z.infer<typeof passwordRecordSchema>>}
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('base64');
  const params = { ...SCRYPT_PARAMS, salt };
  const derived = await deriveKey(password, params);
  return { ...params, hash: derived.toString('base64') };
}

/**
 * @param {string} password
 * @param {z.infer<typeof passwordRecordSchema>} record
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, record) {
  const derived = await deriveKey(password, record);
  const expected = Buffer.from(record.hash, 'base64');
  if (expected.length !== derived.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

/**
 * @param {string} filePath
 * @param {unknown} record
 */
function writeRecordAtomically(filePath, record) {
  const tmpPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(record, null, 2)}\n`;

  // A leftover .tmp from a crash would keep its old mode: remove it first so the mode
  // below is the one that actually applies.
  fs.rmSync(tmpPath, { force: true });
  fs.writeFileSync(tmpPath, payload, { mode: FILE_MODE });
  fs.chmodSync(tmpPath, FILE_MODE);
  // rename() is atomic within a filesystem: readers see either the old file or the new
  // one, never a half-written credential.
  fs.renameSync(tmpPath, filePath);
}

/**
 * Loads `auth.json`, or null when the panel has not been set up yet.
 *
 * A missing file is the normal "not configured yet" state. A file that exists but does not
 * parse is NOT: overwriting it would silently reopen the setup wizard to whoever asks
 * first, so it throws and the startup aborts. Deleting it must stay a human decision.
 *
 * @param {string} filePath
 * @returns {z.infer<typeof authRecordSchema> | null}
 */
function readRecord(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw new Error(`The credentials file ${filePath} could not be read: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `The credentials file ${filePath} is not valid JSON. Fix it, or delete it to run the `
        + 'setup wizard again (that resets the panel password).',
    );
  }

  const result = authRecordSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `The credentials file ${filePath} does not have the expected shape. Fix it, or delete `
        + 'it to run the setup wizard again (that resets the panel password).',
    );
  }

  return result.data;
}

/**
 * @param {{ dataDir: string }} opts
 */
export function createCredentialStore({ dataDir }) {
  const filePath = path.join(dataDir, AUTH_FILE_NAME);
  // Read eagerly: a corrupt file must abort the boot, not surface on the first login.
  // Single user, so the record is cached in memory and refreshed on save().
  let record = readRecord(filePath);

  return {
    /** @returns {boolean} */
    isConfigured() {
      return record !== null;
    },

    /** @returns {string} Empty string while the panel has no credentials. */
    getUsername() {
      return record?.username ?? '';
    },

    /**
     * Writes (or replaces) the panel credentials.
     * @param {{ username: string, password: string }} credentials
     */
    async save({ username, password }) {
      const next = {
        version: RECORD_VERSION,
        username: username.trim(),
        password: await hashPassword(password),
        updatedAt: new Date().toISOString(),
      };
      writeRecordAtomically(filePath, next);
      record = next;
    },

    /**
     * Constant-ish time credential check: the KDF runs even with no credentials stored or a
     * username that does not match, so timing does not leak which of the two failed.
     * @param {{ username: string, password: string }} credentials
     * @returns {Promise<boolean>}
     */
    async verify({ username, password }) {
      const current = record;
      const usernameOk = current !== null && timingSafeStringEqual(username, current.username);
      const passwordOk = await verifyPassword(password, current?.password ?? DECOY_RECORD);
      return usernameOk && passwordOk;
    },
  };
}

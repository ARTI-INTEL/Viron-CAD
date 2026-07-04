/**
 * crypto.js — Ultimate CAD Secret Encryption Utility
 *
 * AES-256-GCM encryption for sensitive per-server secrets (ERLC server key).
 * Values are stored as: "enc1:" + base64(iv + authTag + ciphertext)
 *
 * Backward compatible: any stored value that does NOT start with the
 * "enc1:" prefix is treated as legacy plaintext (pre-encryption rollout)
 * and returned as-is by decryptSecret(), so existing ERLC keys keep
 * working until they're next saved (at which point they get encrypted).
 *
 * ENV:
 *   ERLC_ENCRYPTION_KEY  — 64-char hex string (32 bytes) recommended,
 *                          but any string is accepted and hashed down
 *                          to a 32-byte key via SHA-256.
 *   Required in production (boot-time enforced, see assertEncryptionConfigured).
 */

import crypto from 'crypto';
import { logError, logInfo } from './logger.js';

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 12; // recommended nonce size for GCM
const TAG_LENGTH = 16;
const KEY_ENV    = 'ERLC_ENCRYPTION_KEY';
const ENC_PREFIX = 'enc1:';

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const raw = process.env[KEY_ENV];

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `${KEY_ENV} must be set in production to encrypt/decrypt ERLC server keys. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    logError(
      `${KEY_ENV} is not set. Using an insecure development-only key — ` +
      `set ${KEY_ENV} in your .env before deploying.`,
      'Crypto'
    );
    cachedKey = crypto.createHash('sha256').update('dev-insecure-fallback-key').digest();
    return cachedKey;
  }

  // Accept a 64-char hex string (32 bytes) directly, or hash any other string down to 32 bytes.
  cachedKey = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : crypto.createHash('sha256').update(raw).digest();

  return cachedKey;
}

/**
 * Call once at server boot to fail fast if encryption isn't configured
 * correctly in production, rather than discovering it on first ERLC call.
 */
export function assertEncryptionConfigured() {
  getKey();
  logInfo('ERLC key encryption configured.', 'Crypto');
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypts a secret for storage. Returns null/undefined/'' unchanged
 * so callers can pass through "no value" without special-casing it.
 */
export function encryptSecret(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return plainText;

  const key    = getKey();
  const iv     = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();

  return ENC_PREFIX + Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts a secret read from storage. Legacy plaintext values (no
 * "enc1:" prefix) are returned unchanged for backward compatibility.
 * Returns null if decryption fails (corrupt data / wrong key) so
 * callers can treat it like "no valid key configured".
 */
export function decryptSecret(value) {
  if (value === null || value === undefined || value === '') return value;
  if (!isEncrypted(value)) return value; // legacy plaintext

  try {
    const key       = getKey();
    const raw       = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    const iv        = raw.subarray(0, IV_LENGTH);
    const authTag   = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (err) {
    logError(err, 'Crypto');
    return null;
  }
}

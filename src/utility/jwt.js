/**
 * jwt.js — Ultimate CAD JWT Session Utility
 *
 * Issues signed JWTs after Discord OAuth and verifies them on every
 * authenticated request. Uses HS256 (symmetric) with a key from env.
 *
 * ENV:
 *   JWT_SECRET — long random string (required in production)
 *   JWT_EXPIRES_IN — token lifetime string, e.g. "7d" (default "7d")
 */

import jwt from 'jsonwebtoken';
import { logError, logInfo } from './logger.js';

const SECRET_ENV = 'JWT_SECRET';

const DEFAULT_EXPIRY = '7d';

function getSecret() {
  const raw = process.env[SECRET_ENV];

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `${SECRET_ENV} must be set in production. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }
    logError(
      `${SECRET_ENV} is not set. Using an insecure development-only secret — set ${SECRET_ENV} in your .env before deploying.`,
      'JWT'
    );
    return 'dev-insecure-jwt-secret-do-not-use-in-production';
  }

  return raw;
}

/**
 * Call once at server boot to fail fast if JWT_SECRET isn't configured.
 */
export function assertJwtConfigured() {
  getSecret();
  logInfo('JWT session tokens configured.', 'JWT');
}

/**
 * Sign a JWT for the given user.
 * @param {number} iduser
 * @returns {string} signed JWT string
 */
export function signToken(iduser) {
  const secret = getSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRY;
  return jwt.sign({ iduser }, secret, { expiresIn });
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ iduser: number } | null} decoded payload or null on failure
 */
export function verifyToken(token) {
  try {
    const secret = getSecret();
    const decoded = jwt.verify(token, secret);
    return { iduser: decoded.iduser };
  } catch (_) {
    return null;
  }
}

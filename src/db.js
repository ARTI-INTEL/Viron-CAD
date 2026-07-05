import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';
import { logInfo, logError } from './utility/logger.js';

dotenv.config();

/**
 * Builds the mysql2 ssl config object from env vars.
 * Returns undefined when DB_SSL is not enabled (local/dev default).
 *
 * ENV:
 *   DB_SSL                     — 'true' to enable SSL
 *   DB_SSL_CA_PATH             — path to CA cert file (recommended)
 *   DB_SSL_CA                  — inline PEM string (alt to CA_PATH; supports literal \n)
 *   DB_SSL_CERT_PATH           — client cert (mutual TLS, optional)
 *   DB_SSL_KEY_PATH            — client key  (mutual TLS, optional)
 *   DB_SSL_REJECT_UNAUTHORIZED — 'false' to disable verification (BLOCKED in production)
 */
function buildSslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;

  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

  if (!rejectUnauthorized && process.env.NODE_ENV === 'production') {
    throw new Error(
      'DB_SSL_REJECT_UNAUTHORIZED=false is not allowed in production. ' +
      'Provide a valid CA certificate via DB_SSL_CA_PATH instead of disabling verification.'
    );
  }

  const ssl = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized,
  };

  if (process.env.DB_SSL_CA_PATH) {
    try {
      ssl.ca = fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8');
    } catch (err) {
      throw new Error(`Could not read DB_SSL_CA_PATH (${process.env.DB_SSL_CA_PATH}): ${err.message}`);
    }
  } else if (process.env.DB_SSL_CA) {
    // Inline PEM (e.g. injected via secrets manager). Un-escape literal \n.
    ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  } else if (process.env.NODE_ENV === 'production' && rejectUnauthorized) {
    logError(
      'DB_SSL is enabled but no CA certificate was provided (DB_SSL_CA_PATH or DB_SSL_CA). ' +
      'Falling back to the system/Node trust store — set one explicitly if your DB provider requires a custom CA.',
      'DB'
    );
  }

  // Optional mutual TLS (client cert auth)
  if (process.env.DB_SSL_CERT_PATH) {
    try {
      ssl.cert = fs.readFileSync(process.env.DB_SSL_CERT_PATH, 'utf8');
    } catch (err) {
      throw new Error(`Could not read DB_SSL_CERT_PATH: ${err.message}`);
    }
  }
  if (process.env.DB_SSL_KEY_PATH) {
    try {
      ssl.key = fs.readFileSync(process.env.DB_SSL_KEY_PATH, 'utf8');
    } catch (err) {
      throw new Error(`Could not read DB_SSL_KEY_PATH: ${err.message}`);
    }
  }

  return ssl;
}

const sslConfig = buildSslConfig();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: sslConfig,
});

/* ── Pool-level error handler ─────────────────────────────────
   Prevents crashes from idle connection drops (e.g. MySQL server
   closing idle connections after wait_timeout).               */
pool.on('error', function (err) {
  console.error('[DB] Pool error:', err.message);
  // The pool automatically retries on connection loss for the
  // next query, but we log so operators know about it.
});

/**
 * Call once at server boot (alongside assertEncryptionConfigured /
 * assertJwtConfigured) to fail loud rather than silently connecting
 * to production MySQL over plaintext.
 */
export function assertDbSslConfigured() {
  if (process.env.NODE_ENV === 'production' && !sslConfig) {
    logError(
      'DB_SSL is not enabled in production. Set DB_SSL=true and DB_SSL_CA_PATH ' +
      'to encrypt the connection to MySQL.',
      'DB'
    );
    return;
  }
  if (sslConfig) {
    logInfo(
      `Database SSL enabled (minVersion=${sslConfig.minVersion}, rejectUnauthorized=${sslConfig.rejectUnauthorized}, ca=${sslConfig.ca ? 'provided' : 'system default'}).`,
      'DB'
    );
  } else {
    logInfo('Database SSL disabled (DB_SSL not set) — fine for local/dev.', 'DB');
  }
}

export default pool;
/**
 * scripts/encrypt-existing-erlc-keys.js
 *
 * One-time migration: encrypts any ERLC server keys currently stored
 * as plaintext. Safe to re-run — already-encrypted keys (prefixed
 * "enc1:") are skipped.
 *
 * Usage:  node scripts/encrypt-existing-erlc-keys.js
 */

import pool from '../src/db.js';
import { encryptSecret, isEncrypted } from '../src/utility/crypto.js';
import { logInfo, logError } from '../src/utility/logger.js';

async function run() {
  const [rows] = await pool.query(
    'SELECT idserver, erlc_server_key FROM servers WHERE erlc_server_key IS NOT NULL AND erlc_server_key <> ""'
  );

  let migrated = 0;

  for (const row of rows) {
    if (isEncrypted(row.erlc_server_key)) continue;

    const encrypted = encryptSecret(row.erlc_server_key);
    await pool.query(
      'UPDATE servers SET erlc_server_key = ? WHERE idserver = ?',
      [encrypted, row.idserver]
    );
    migrated++;
  }

  logInfo(`Migrated ${migrated} ERLC server key(s) to encrypted storage.`, 'Migration');
  process.exit(0);
}

run().catch((err) => {
  logError(err, 'Migration');
  process.exit(1);
});

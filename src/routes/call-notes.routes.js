/**
 * call-notes.routes.js  Ultimate CAD – Call Notes API
 *
 * Auto-generated notes when calls/attachments change, plus manual notes.
 *
 * ENV: none
 */

import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember, verifyUnit } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

/* ── Helpers ───────────────────────────────────────────────── */

/**
 * Insert a note into call_notes. Used by both this route file and
 * imported by calls.routes.js / units.routes.js for auto-logging.
 */
export async function addCallNote({ callId, serverId, type, message, userId, userName }) {
  if (!callId || !serverId) return;
  try {
    await pool.query(
      `INSERT INTO call_notes (call_id, server_id, type, message, created_by, created_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [callId, serverId, type || 'system', String(message).substring(0, 1000), userId || null, userName || null]
    );
  } catch (err) {
    logError('[CallNotes] Failed to add note:', err);
  }
}

/* ── GET /call-notes/:callId ────────────────────────────────── */
router.get('/:callId', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, message, created_by, created_name, created_at
       FROM call_notes
       WHERE call_id = ?
       ORDER BY created_at ASC`,
      [req.params.callId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

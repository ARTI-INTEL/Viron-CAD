import { Router } from 'express';
import pool from '../db.js';
import { verifyUser } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

/* ── Exported helpers (used by other route files) ─────────── */

export async function logAuditEvent(serverId, userId, action, targetType, targetId, details) {
  try {
    await pool.query(
      'INSERT INTO server_audit_log (server_id, user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [serverId, userId, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null]
    );
  } catch (_) {
    // silent – logging should never break the main flow
  }
}

async function isServerOwner(serverId, userId) {
  const [rows] = await pool.query('SELECT owner_id FROM servers WHERE idserver = ?', [serverId]);
  return rows.length > 0 && String(rows[0].owner_id) === String(userId);
}

/* ── GET /audit/:serverId  list audit events for a server ───── */
/*     Only the server owner can view the audit log.            */
router.get('/:serverId', verifyUser, async (req, res) => {
  const { serverId } = req.params;
  const { limit, offset, action: actionFilter } = req.query;

  try {
    if (!(await isServerOwner(serverId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden: only the server owner can view the audit log' });

    let sql = `SELECT sal.*, u.username
               FROM server_audit_log sal
               JOIN users u ON u.iduser = sal.user_id
               WHERE sal.server_id = ?`;
    const params = [serverId];

    if (actionFilter) {
      sql += ' AND sal.action = ?';
      params.push(actionFilter);
    }

    sql += ' ORDER BY sal.created_at DESC LIMIT ? OFFSET ?';
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    const offsetNum = parseInt(offset, 10) || 0;
    params.push(limitNum, offsetNum);

    const [rows] = await pool.query(sql, params);

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM server_audit_log WHERE server_id = ?',
      [serverId]
    );

    res.json({
      events: rows,
      total: countRows[0].total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /audit/:serverId/actions  list distinct action types ── */
router.get('/:serverId/actions', verifyUser, async (req, res) => {
  const { serverId } = req.params;
  try {
    if (!(await isServerOwner(serverId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const [rows] = await pool.query(
      'SELECT DISTINCT action FROM server_audit_log WHERE server_id = ? ORDER BY action',
      [serverId]
    );
    res.json(rows.map(function (r) { return r.action; }));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

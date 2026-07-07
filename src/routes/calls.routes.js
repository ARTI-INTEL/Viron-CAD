import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember, verifyUnit } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';
import { logAuditEvent } from './audit.routes.js';
import { addCallNote } from './call-notes.routes.js';

const router = Router();

// GET /calls/:serverId  all active calls (any member can view)
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, GROUP_CONCAT(o.callsign SEPARATOR ', ') AS units
       FROM calls c
       LEFT JOIN units o ON o.current_call = c.id
       WHERE c.server_id = ? AND c.status = 'ACTIVE'
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.params.serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /calls/:serverId/history  closed calls (any member can view)
router.get('/:serverId/history', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM calls WHERE server_id = ? AND status = 'CLOSED' ORDER BY closed_at DESC`,
      [req.params.serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /calls  create a call (must be clocked in)
router.post('/', verifyUser, verifyUnit, async (req, res) => {
  const { serverId, nature, location, priority } = req.body;
  if (!serverId || !nature || !location)
    return res.status(400).json({ error: 'serverId, nature, and location are required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO calls (server_id, nature, location, priority) VALUES (?, ?, ?, ?)',
      [serverId, nature, location, priority || 'Low']
    );
    const [rows] = await pool.query('SELECT * FROM calls WHERE id = ?', [result.insertId]);

    logAuditEvent(serverId, req.user.iduser, 'CALL_CREATED', 'call', result.insertId, {
      nature, location, priority: priority || 'Low',
    }).catch(function () {});

    // Auto-log call note
    addCallNote({
      callId: result.insertId,
      serverId,
      type: 'system',
      message: `Call created by ${req.user.username || 'Unknown'} — Nature: ${nature}, Location: ${location}, Priority: ${priority || 'Low'}`,
      userId: req.user.iduser,
      userName: req.user.username,
    }).catch(function () {});

    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /calls/:callId  update a call (must be clocked in)
router.patch('/:callId', verifyUser, verifyUnit, async (req, res) => {
  const { nature, location, priority, serverId } = req.body;
  try {
    await pool.query(
      'UPDATE calls SET nature = ?, location = ?, priority = ? WHERE id = ?',
      [nature, location, priority, req.params.callId]
    );

    // Auto-log update note
    addCallNote({
      callId: Number(req.params.callId),
      serverId,
      type: 'update',
      message: `Call updated by ${req.user.username || 'Unknown'} — Nature: ${nature}, Location: ${location}, Priority: ${priority}`,
      userId: req.user.iduser,
      userName: req.user.username,
    }).catch(function () {});

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /calls/:callId/close  CODE 4 (must be clocked in)
router.patch('/:callId/close', verifyUser, verifyUnit, async (req, res) => {
  try {
    const [callRows] = await pool.query('SELECT server_id FROM calls WHERE id = ?', [req.params.callId]);
    await pool.query(
      `UPDATE calls SET status = 'CLOSED', closed_at = NOW() WHERE id = ?`,
      [req.params.callId]
    );
    await pool.query(
      'UPDATE units SET current_call = NULL WHERE current_call = ?',
      [req.params.callId]
    );

    if (callRows.length) {
      logAuditEvent(callRows[0].server_id, req.user.iduser, 'CALL_CLOSED', 'call', Number(req.params.callId), {})
        .catch(function () {});

      // Auto-log close note
      addCallNote({
        callId: Number(req.params.callId),
        serverId: callRows[0].server_id,
        type: 'system',
        message: `Call closed (CODE 4) by ${req.user.username || 'Unknown'}`,
        userId: req.user.iduser,
        userName: req.user.username,
      }).catch(function () {});
    }

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
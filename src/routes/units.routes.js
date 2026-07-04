import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logClockInActivity } from './dept-activity.routes.js';
import { logError } from '../utility/logger.js';

const router = Router();

// GET /units/:serverId  all on-duty units (any member can view)
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*
       FROM units o
       INNER JOIN (
         SELECT MAX(id) AS id
         FROM units
         WHERE server_id = ?
         GROUP BY user_id
       ) latest ON latest.id = o.id
       ORDER BY o.department ASC, o.callsign ASC`,
      [req.params.serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /units/clock-in (must be a server member)
router.post('/clock-in', verifyUser, verifyMember, async (req, res) => {
  const { serverId, name, callsign, department } = req.body;
  if (!serverId || !name || !callsign || !department)
    return res.status(400).json({ error: 'All fields are required' });

  try {
    const [existing] = await pool.query(
      `SELECT *
       FROM units
       WHERE user_id = ? AND server_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [req.user.iduser, serverId]
    );

    let unitId;
    if (existing.length) {
      unitId = existing[0].id;
      await pool.query(
        'DELETE FROM units WHERE user_id = ? AND server_id = ? AND id <> ?',
        [req.user.iduser, serverId, unitId]
      );
      await pool.query(
        `UPDATE units
         SET name = ?, callsign = ?, department = ?, status = 'AVAILABLE',
             location = '', current_call = NULL, clocked_in = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [name, callsign, department, unitId]
      );
    } else {
      const [result] = await pool.query(
        `INSERT INTO units (user_id, server_id, name, callsign, department)
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.iduser, serverId, name, callsign, department]
      );
      unitId = result.insertId;
    }

    const [rows] = await pool.query('SELECT * FROM units WHERE id = ?', [unitId]);

    // Log clock-in activity for department members
    logClockInActivity(req.user.iduser, serverId, department).catch(function () {});

    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /units/clock-out/:unitId (must be the same user)
router.delete('/clock-out/:unitId', verifyUser, async (req, res) => {
  try {
    // Ensure the unit session belongs to the requesting user
    const [rows] = await pool.query(
      'SELECT * FROM units WHERE id = ? AND user_id = ?',
      [req.params.unitId, req.user.iduser]
    );
    if (rows.length === 0)
      return res.status(403).json({ error: 'Forbidden: not your unit session' });

    await pool.query(
      'DELETE FROM units WHERE user_id = ? AND server_id = ?',
      [req.user.iduser, rows[0].server_id]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /units/:unitId/status (must be the same user)
router.patch('/:unitId/status', verifyUser, async (req, res) => {
  const { status, location, currentCall } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM units WHERE id = ? AND user_id = ?',
      [req.params.unitId, req.user.iduser]
    );
    if (rows.length === 0)
      return res.status(403).json({ error: 'Forbidden: not your unit session' });

    await pool.query(
      'UPDATE units SET status = ?, location = ?, current_call = ? WHERE id = ?',
      [status, location ?? '', currentCall ?? null, req.params.unitId]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

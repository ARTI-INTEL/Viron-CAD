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
  const { serverId, name, callsign, department, vehicleId } = req.body;
  if (!serverId || !name || !callsign || !department)
    return res.status(400).json({ error: 'All fields are required' });

  try {
    // ── Check if department is whitelist-only ──────────────────
    const [deptCheck] = await pool.query(
      'SELECT id, wl_only FROM departments WHERE server_id = ? AND name = ? LIMIT 1',
      [serverId, department]
    );
    if (deptCheck.length && deptCheck[0].wl_only) {
      const [memberCheck] = await pool.query(
        `SELECT dm.id FROM dept_members dm WHERE dm.dept_id = ? AND dm.user_id = ?`,
        [deptCheck[0].id, req.user.iduser]
      );
      if (!memberCheck.length)
        return res.status(403).json({ error: 'This department is whitelist-only. You must be a department member to clock in.' });
    }

    const [existing] = await pool.query(
      `SELECT *
       FROM units
       WHERE user_id = ? AND server_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [req.user.iduser, serverId]
    );

    // If a vehicle was chosen, verify it belongs to this dept and exists
    if (vehicleId) {
      const [vehRows] = await pool.query(
        'SELECT dv.id, d.assigned_vehicles_enabled FROM dept_vehicles dv JOIN departments d ON d.id = dv.dept_id WHERE dv.id = ? AND dv.dept_id = (SELECT id FROM departments WHERE server_id = ? AND name = ? LIMIT 1)',
        [vehicleId, serverId, department]
      );
      if (!vehRows.length)
        return res.status(400).json({ error: 'Vehicle not found for this department' });
      if (!vehRows[0].assigned_vehicles_enabled)
        return res.status(400).json({ error: 'Assigned vehicles are not enabled for this department' });
    }

    let unitId;
    if (existing.length) {
      unitId = existing[0].id;
      // Clear old vehicle assignment for this user's units first
      await pool.query(
        'UPDATE dept_vehicles SET assigned_to_unit_id = NULL WHERE assigned_to_unit_id IN (SELECT id FROM units WHERE user_id = ? AND server_id = ?)',
        [req.user.iduser, serverId]
      );
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

    // After clearing old assignments, check availability and assign vehicle
    if (vehicleId) {
      // Check if another user grabbed the vehicle between validation and clearing
      const [assignedRows] = await pool.query(
        'SELECT id FROM dept_vehicles WHERE id = ? AND assigned_to_unit_id IS NOT NULL',
        [vehicleId]
      );
      if (assignedRows.length)
        return res.status(409).json({ error: 'Vehicle is already assigned to another unit' });

      await pool.query(
        'UPDATE dept_vehicles SET assigned_to_unit_id = ? WHERE id = ?',
        [unitId, vehicleId]
      );
    }

    const [rows] = await pool.query(
      `SELECT u.*, dv.id AS vehicle_id, dv.name AS vehicle_name, dv.model AS vehicle_model, dv.plate AS vehicle_plate, dv.color AS vehicle_color
       FROM units u
       LEFT JOIN dept_vehicles dv ON dv.assigned_to_unit_id = u.id
       WHERE u.id = ?`,
      [unitId]
    );

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

    // Clear any vehicle assignment for this user's units
    await pool.query(
      'UPDATE dept_vehicles SET assigned_to_unit_id = NULL WHERE assigned_to_unit_id IN (SELECT id FROM units WHERE user_id = ? AND server_id = ?)',
      [req.user.iduser, rows[0].server_id]
    );

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

// PATCH /units/:unitId/attach-call  self-dispatch to a call (must be the same user)
router.patch('/:unitId/attach-call', verifyUser, async (req, res) => {
  const { callId } = req.body;
  if (!callId) return res.status(400).json({ error: 'callId is required' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM units WHERE id = ? AND user_id = ?',
      [req.params.unitId, req.user.iduser]
    );
    if (rows.length === 0)
      return res.status(403).json({ error: 'Forbidden: not your unit session' });

    await pool.query(
      'UPDATE units SET current_call = ?, status = ? WHERE id = ?',
      [callId, 'ENROUTE', req.params.unitId]
    );
    res.json({ success: true, callId: Number(callId) });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /units/:unitId/detach-call  remove self from current call (must be the same user)
router.patch('/:unitId/detach-call', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM units WHERE id = ? AND user_id = ?',
      [req.params.unitId, req.user.iduser]
    );
    if (rows.length === 0)
      return res.status(403).json({ error: 'Forbidden: not your unit session' });

    await pool.query(
      "UPDATE units SET current_call = NULL, status = 'AVAILABLE' WHERE id = ?",
      [req.params.unitId]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

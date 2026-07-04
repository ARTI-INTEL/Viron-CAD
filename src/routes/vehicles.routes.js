import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

// GET /vehicles/:serverId  all vehicles (any member)
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM vehicles v
       LEFT JOIN characters c ON c.id = v.owner_id
       WHERE v.server_id = ?
       ORDER BY v.plate`,
      [req.params.serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /vehicles/:serverId/mine  vehicles belonging to my characters
router.get('/:serverId/mine', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM vehicles v
       JOIN characters c ON c.id = v.owner_id
       WHERE v.server_id = ? AND c.user_id = ?
       ORDER BY v.plate`,
      [req.params.serverId, req.user.iduser]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /vehicles/:serverId/character/:charId
router.get('/:serverId/character/:charId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM vehicles v
       LEFT JOIN characters c ON c.id = v.owner_id
       WHERE v.server_id = ? AND v.owner_id = ?`,
      [req.params.serverId, req.params.charId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /vehicles  create vehicle (must be a member)
router.post('/', verifyUser, verifyMember, async (req, res) => {
  const {
    serverId, ownerId, plate, vin, model, color,
    registrationExpiry, insuranceStatus, insuranceExpiry
  } = req.body;

  if (!serverId || !plate || !model)
    return res.status(400).json({ error: 'serverId, plate, and model are required' });

  try {
    const [result] = await pool.query(
      `INSERT INTO vehicles
         (server_id, owner_id, plate, vin, model, color,
          registration_expiry, insurance_status, insurance_expiry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        serverId, ownerId || null, plate, vin || null, model,
        color || null, registrationExpiry || null,
        insuranceStatus || 'Active', insuranceExpiry || null
      ]
    );
    const [rows] = await pool.query(
      `SELECT v.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM vehicles v LEFT JOIN characters c ON c.id = v.owner_id
       WHERE v.id = ?`,
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /vehicles/:id
router.patch('/:id', verifyUser, async (req, res) => {
  const {
    ownerId, plate, vin, model, color,
    registrationExpiry, insuranceStatus, insuranceExpiry
  } = req.body;

  try {
    // Verify ownership through character
    const [rows] = await pool.query(
      `SELECT v.id FROM vehicles v
       JOIN characters c ON c.id = v.owner_id
       WHERE v.id = ? AND c.user_id = ?`,
      [req.params.id, req.user.iduser]
    );
    if (!rows.length) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(
      `UPDATE vehicles SET
         owner_id=?, plate=?, vin=?, model=?, color=?,
         registration_expiry=?, insurance_status=?, insurance_expiry=?
       WHERE id=?`,
      [
        ownerId || null, plate, vin, model, color,
        registrationExpiry, insuranceStatus, insuranceExpiry, req.params.id
      ]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /vehicles/:id
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.id FROM vehicles v
       JOIN characters c ON c.id = v.owner_id
       WHERE v.id = ? AND c.user_id = ?`,
      [req.params.id, req.user.iduser]
    );
    if (!rows.length) return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
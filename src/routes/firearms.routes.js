import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

// GET /firearms/:serverId  all firearms (any member)
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM firearms f
       LEFT JOIN characters c ON c.id = f.owner_id
       WHERE f.server_id = ?
       ORDER BY f.serial`,
      [req.params.serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /firearms/:serverId/mine  firearms belonging to my characters
router.get('/:serverId/mine', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM firearms f
       JOIN characters c ON c.id = f.owner_id
       WHERE f.server_id = ? AND c.user_id = ?
       ORDER BY f.serial`,
      [req.params.serverId, req.user.iduser]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /firearms/:serverId/character/:charId
router.get('/:serverId/character/:charId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM firearms f
       LEFT JOIN characters c ON c.id = f.owner_id
       WHERE f.server_id = ? AND f.owner_id = ?`,
      [req.params.serverId, req.params.charId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /firearms  register firearm (must be a member)
router.post('/', verifyUser, verifyMember, async (req, res) => {
  const { serverId, ownerId, serial, name, type } = req.body;

  if (!serverId || !serial || !type)
    return res.status(400).json({ error: 'serverId, serial, and type are required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO firearms (server_id, owner_id, serial, name, type) VALUES (?, ?, ?, ?, ?)',
      [serverId, ownerId || null, serial, name || null, type]
    );
    const [rows] = await pool.query(
      `SELECT f.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM firearms f LEFT JOIN characters c ON c.id = f.owner_id
       WHERE f.id = ?`,
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /firearms/:id
router.patch('/:id', verifyUser, async (req, res) => {
  const { ownerId, serial, name, type } = req.body;

  try {
    const [rows] = await pool.query(
      `SELECT f.id FROM firearms f
       JOIN characters c ON c.id = f.owner_id
       WHERE f.id = ? AND c.user_id = ?`,
      [req.params.id, req.user.iduser]
    );
    if (!rows.length) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(
      'UPDATE firearms SET owner_id=?, serial=?, name=?, type=? WHERE id=?',
      [ownerId || null, serial, name, type, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /firearms/:id
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.id FROM firearms f
       JOIN characters c ON c.id = f.owner_id
       WHERE f.id = ? AND c.user_id = ?`,
      [req.params.id, req.user.iduser]
    );
    if (!rows.length) return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM firearms WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
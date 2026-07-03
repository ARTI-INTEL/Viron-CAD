import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

const VALID_TYPES = ['LEO', 'FR', 'DOT'];

async function isServerOwner(serverId, userId) {
  const [rows] = await pool.query('SELECT owner_id FROM servers WHERE idserver = ?', [serverId]);
  if (!rows.length) return false;
  return String(rows[0].owner_id) === String(userId);
}

// GET /departments/:serverId  list departments for a server (any member), optional ?type=LEO
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  const { type } = req.query;
  try {
    const params = [req.params.serverId];
    let sql = 'SELECT * FROM departments WHERE server_id = ?';
    if (type) {
      if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type filter' });
      sql += ' AND type = ?';
      params.push(type);
    }
    sql += ' ORDER BY type, name';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /departments  create (owner only)
router.post('/', verifyUser, async (req, res) => {
  const { serverId, name, type } = req.body;
  if (!serverId || !name || !type)
    return res.status(400).json({ error: 'serverId, name, and type are required' });
  if (!VALID_TYPES.includes(type))
    return res.status(400).json({ error: 'type must be one of LEO, FR, DOT' });

  try {
    if (!(await isServerOwner(serverId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden: only the server owner can manage departments' });

    const [result] = await pool.query(
      'INSERT INTO departments (server_id, name, type) VALUES (?, ?, ?)',
      [serverId, name.trim(), type]
    );
    const [rows] = await pool.query('SELECT * FROM departments WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /departments/:id  update (owner only)
router.patch('/:id', verifyUser, async (req, res) => {
  const { name, type } = req.body;
  if (type && !VALID_TYPES.includes(type))
    return res.status(400).json({ error: 'type must be one of LEO, FR, DOT' });

  try {
    const [deptRows] = await pool.query('SELECT * FROM departments WHERE id = ?', [req.params.id]);
    if (!deptRows.length) return res.status(404).json({ error: 'Department not found' });
    if (!(await isServerOwner(deptRows[0].server_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden: only the server owner can manage departments' });

    await pool.query(
      'UPDATE departments SET name = COALESCE(?, name), type = COALESCE(?, type) WHERE id = ?',
      [name ? name.trim() : null, type || null, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM departments WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /departments/:id  (owner only)
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const [deptRows] = await pool.query('SELECT * FROM departments WHERE id = ?', [req.params.id]);
    if (!deptRows.length) return res.status(404).json({ error: 'Department not found' });
    if (!(await isServerOwner(deptRows[0].server_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden: only the server owner can manage departments' });

    await pool.query('DELETE FROM departments WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

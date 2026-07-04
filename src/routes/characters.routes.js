import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

// GET /characters/:serverId  all characters (any member can view)
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM characters WHERE server_id = ? ORDER BY last_name, first_name',
      [req.params.serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /characters/:serverId/mine  my characters only
router.get('/:serverId/mine', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM characters WHERE server_id = ? AND user_id = ? ORDER BY last_name, first_name',
      [req.params.serverId, req.user.iduser]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /characters  create character (must be a member)
router.post('/', verifyUser, verifyMember, async (req, res) => {
  const {
    serverId, firstName, lastName, dob, gender, occupation,
    height, weight, skinTone, hairTone, eyeColor, address
  } = req.body;

  if (!serverId || !firstName || !lastName || !dob)
    return res.status(400).json({ error: 'serverId, firstName, lastName, and dob are required' });

  try {
    const [result] = await pool.query(
      `INSERT INTO characters
         (server_id, user_id, first_name, last_name, dob, gender, occupation,
          height, weight, skin_tone, hair_tone, eye_color, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        serverId, req.user.iduser, firstName, lastName, dob,
        gender || null, occupation || null, height || null,
        weight || null, skinTone || null, hairTone || null,
        eyeColor || null, address || null
      ]
    );
    const [rows] = await pool.query('SELECT * FROM characters WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /characters/:id  update (owner only)
router.patch('/:id', verifyUser, async (req, res) => {
  const {
    firstName, lastName, dob, gender, occupation,
    height, weight, skinTone, hairTone, eyeColor, address
  } = req.body;

  try {
    const [chars] = await pool.query(
      'SELECT id FROM characters WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.iduser]
    );
    if (!chars.length) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(
      `UPDATE characters SET
         first_name=?, last_name=?, dob=?, gender=?, occupation=?,
         height=?, weight=?, skin_tone=?, hair_tone=?, eye_color=?, address=?
       WHERE id=?`,
      [firstName, lastName, dob, gender, occupation,
       height, weight, skinTone, hairTone, eyeColor, address, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /characters/:id (owner only)
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const [chars] = await pool.query(
      'SELECT id FROM characters WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.iduser]
    );
    if (!chars.length) return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM characters WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
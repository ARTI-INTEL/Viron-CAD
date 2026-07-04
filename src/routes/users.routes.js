import { Router } from 'express';
import pool from '../db.js';
import { verifyUser } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

// GET /users/login/:discordId  check if user exists
router.get('/login/:discordId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE discord_id = ?',
      [req.params.discordId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /users/register  create or return existing user
router.post('/register', async (req, res) => {
  const { discordId, username } = req.body;
  if (!discordId || !username)
    return res.status(400).json({ error: 'discordId and username are required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO users (discord_id, username) VALUES (?, ?)',
      [discordId, username]
    );
    const [rows] = await pool.query('SELECT * FROM users WHERE iduser = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const [rows] = await pool.query('SELECT * FROM users WHERE discord_id = ?', [discordId]);
      return res.json(rows[0]);
    }
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /users/getUserByDiscordId/:discordId
router.get('/getUserByDiscordId/:discordId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE discord_id = ?',
      [req.params.discordId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /users/update  update username
router.patch('/update', verifyUser, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });

  try {
    await pool.query(
      'UPDATE users SET username = ? WHERE iduser = ?',
      [username, req.user.iduser]
    );
    const [rows] = await pool.query('SELECT * FROM users WHERE iduser = ?', [req.user.iduser]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /users/email  update email address
router.patch('/email', verifyUser, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Invalid email format' });

  try {
    await pool.query('UPDATE users SET email = ? WHERE iduser = ?', [email, req.user.iduser]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /users/me  get current user's full profile (including email)
router.get('/me', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT iduser, discord_id, username, email, created_at FROM users WHERE iduser = ?',
      [req.user.iduser]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
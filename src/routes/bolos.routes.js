import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember, verifyUnit } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';
import { sendBoloWebhook } from '../utility/webhook.js';

const router = Router();

// GET /bolos/:serverId  all active BOLOs (any member can view)
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM bolos WHERE server_id = ? AND active = 1 ORDER BY created_at DESC',
      [req.params.serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /bolos  create a BOLO (must be clocked in)
router.post('/', verifyUser, verifyUnit, async (req, res) => {
  const { serverId, type, reason, description } = req.body;
  if (!serverId || !type || !reason || !description)
    return res.status(400).json({ error: 'All fields are required' });

  try {
    const [result] = await pool.query(
      'INSERT INTO bolos (server_id, type, reason, description) VALUES (?, ?, ?, ?)',
      [serverId, type, reason, description]
    );
    const [rows] = await pool.query('SELECT * FROM bolos WHERE id = ?', [result.insertId]);

    // ── Fire BOLO webhook for any department that has one configured ──
    try {
      const [deptRows] = await pool.query(
        'SELECT bolo_webhook_url FROM departments WHERE server_id = ? AND bolo_webhook_url IS NOT NULL',
        [serverId]
      );
      const [userRows] = await pool.query(
        'SELECT username FROM users WHERE iduser = ?',
        [req.user.iduser]
      );
      const officerName = userRows.length ? userRows[0].username : 'Unknown';
      for (const dept of deptRows) {
        sendBoloWebhook(dept.bolo_webhook_url, {
          type,
          reason,
          description,
          officerName,
        }).catch(function () {});
      }
    } catch (_) {
      // silent
    }

    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /bolos/:boloId  update a BOLO (must be clocked in)
router.patch('/:boloId', verifyUser, verifyUnit, async (req, res) => {
  const { type, reason, description } = req.body;
  try {
    await pool.query(
      'UPDATE bolos SET type = ?, reason = ?, description = ? WHERE id = ?',
      [type, reason, description, req.params.boloId]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /bolos/:boloId  end a BOLO (must be clocked in)
router.delete('/:boloId', verifyUser, verifyUnit, async (req, res) => {
  try {
    await pool.query('UPDATE bolos SET active = 0 WHERE id = ?', [req.params.boloId]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
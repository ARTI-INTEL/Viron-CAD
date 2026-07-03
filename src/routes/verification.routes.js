import { Router }               from 'express';
import pool                        from '../db.js';
import { verifyUser }              from '../middleware/auth.middleware.js';
import { sendVerificationCode }    from '../utility/mailler.js';
import { logError }                from '../utility/logger.js';

const router = Router();

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* ── POST /verification/send ─────────────────────────────────────────── */
router.post('/send', verifyUser, async (req, res) => {
  const { action } = req.body;
  if (!action) return res.status(400).json({ error: 'action is required' });

  try {
    const [rows] = await pool.query(
      'SELECT email FROM users WHERE iduser = ?',
      [req.user.iduser]
    );

    const email = rows[0]?.email;
    if (!email) {
      return res.status(400).json({
        error: 'No email address on file. Please add one in Account Settings first.',
      });
    }

    // Remove old unused codes for this user + action
    await pool.query(
      'DELETE FROM verification_codes WHERE user_id = ? AND action = ? AND used = 0',
      [req.user.iduser, action]
    );

    const code      = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await pool.query(
      'INSERT INTO verification_codes (user_id, code, action, expires_at) VALUES (?, ?, ?, ?)',
      [req.user.iduser, code, action, expiresAt]
    );

    // Delegate sending to the mailler utility
    await sendVerificationCode(email, code, action);

    // Return a masked email so the frontend can display "sent to ab***@gmail.com"
    const masked = email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) =>
      a + b.replace(/./g, '*') + c
    );

    res.json({ success: true, maskedEmail: masked });
  } catch (err) {
    logError('Failed to send verification code', err);
    res.status(500).json({ error: 'Failed to send verification code.' });
  }
});

/* ── POST /verification/verify ───────────────────────────────────────── */
router.post('/verify', verifyUser, async (req, res) => {
  const { code, action } = req.body;
  if (!code || !action) {
    return res.status(400).json({ error: 'code and action are required' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT * FROM verification_codes
       WHERE user_id = ? AND code = ? AND action = ? AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.iduser, code.trim(), action]
    );

    if (!rows.length) {
      return res.status(400).json({
        error: 'Invalid or expired code. Please request a new one.',
      });
    }

    await pool.query('UPDATE verification_codes SET used = 1 WHERE id = ?', [rows[0].id]);
    res.json({ success: true });
  } catch (err) {
    logError('Verification check failed', err);
    res.status(500).json({ error: 'Database error during verification.' });
  }
});

export default router;

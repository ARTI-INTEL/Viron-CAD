import crypto from 'crypto';
import pool from '../db.js';
import { verifyToken } from '../utility/jwt.js';
import { logError } from '../utility/logger.js';

/**
 * verifyUser
 * Validates the JWT from the Authorization header (Bearer token)
 * and attaches the user record to req.user.
 * Also checks the session exists and is not revoked.
 */
export async function verifyUser(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorised: missing or invalid token' });

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload || !payload.iduser)
    return res.status(401).json({ error: 'Unauthorised: invalid or expired token' });

  try {
    // Check session is not revoked
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [sessionRows] = await pool.query(
      'SELECT id, revoked FROM user_sessions WHERE token_hash = ?',
      [tokenHash]
    );
    if (sessionRows.length && sessionRows[0].revoked) {
      return res.status(401).json({ error: 'Unauthorised: session has been revoked' });
    }

    // Update last_used_at
    if (sessionRows.length) {
      pool.query('UPDATE user_sessions SET last_used_at = NOW() WHERE id = ?', [sessionRows[0].id])
        .catch(function () {});
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE iduser = ?',
      [payload.iduser]
    );
    if (rows.length === 0)
      return res.status(401).json({ error: 'Unauthorised: user not found' });

    req.user = rows[0];
    next();
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error during auth' });
  }
}

/**
 * verifyMember
 * Checks that the user is a member of the server they are trying to access.
 * Requires verifyUser to run first.
 * Expects serverId in req.params or req.body.
 */
export async function verifyMember(req, res, next) {
  const serverId = req.params.serverId || req.body.serverId;

  if (!serverId)
    return res.status(400).json({ error: 'Bad request: serverId is required' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM server_members WHERE user_id = ? AND server_id = ?',
      [req.user.iduser, serverId]
    );
    if (rows.length === 0)
      return res.status(403).json({ error: 'Forbidden: you are not a member of this server' });

    next();
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error during auth' });
  }
}

/**
 * verifyUnit
 * Checks that the user has an active clocked-in unit session on this server.
 * Requires verifyUser to run first.
 * Attaches req.unit for downstream use.
 * Expects serverId in req.params or req.body.
 */
export async function verifyUnit(req, res, next) {
  const serverId = req.params.serverId || req.body.serverId;

  if (!serverId)
    return res.status(400).json({ error: 'Bad request: serverId is required' });

  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM units
       WHERE user_id = ? AND server_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [req.user.iduser, serverId]
    );
    if (rows.length === 0)
      return res.status(403).json({ error: 'Forbidden: you are not clocked in on this server' });

    req.unit = rows[0];
    next();
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error during auth' });
  }
}

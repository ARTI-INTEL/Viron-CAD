import { Router } from 'express';
import pool from '../db.js';
import { verifyUser } from '../middleware/auth.middleware.js';
import { encryptSecret } from '../utility/crypto.js';
import { logError } from '../utility/logger.js';
import { logAuditEvent } from './audit.routes.js';

const router = Router();

function generateJoinCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// GET /servers/check/:discordGuildId
router.get('/check/:discordGuildId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM servers WHERE discord_id = ?',
      [req.params.discordGuildId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /servers/name/:serverId
router.get('/name/:serverId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM servers WHERE idserver = ?',
      [req.params.serverId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Server not found' });

    const server = rows[0];
    server.hasErlcKey = !!server.erlc_server_key;
    delete server.erlc_server_key; // never expose the raw/encrypted key to clients

    res.json(server);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /servers/join-code/:serverId
router.get('/join-code/:serverId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT join_code AS code FROM servers WHERE idserver = ?',
      [req.params.serverId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Server not found' });
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /servers/members/:serverId/:userId  (legacy single-user check)
router.get('/members/:serverId/:userId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [req.params.serverId, req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── NEW: GET /servers/:serverId/members  list all members ──────────────────
router.get('/:serverId/members', verifyUser, async (req, res) => {
  const { serverId } = req.params;
  try {
    // Caller must be a member of the server
    const [membership] = await pool.query(
      'SELECT id FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.iduser]
    );
    if (!membership.length)
      return res.status(403).json({ error: 'Forbidden: you are not a member of this server' });

    const [rows] = await pool.query(
      `SELECT
         u.iduser,
         u.username,
         u.discord_id,
         sm.joined_at,
         CASE WHEN s.owner_id = u.iduser THEN 'Owner' ELSE 'Member' END AS role
       FROM server_members sm
       JOIN users u    ON u.iduser    = sm.user_id
       JOIN servers s  ON s.idserver  = sm.server_id
       WHERE sm.server_id = ?
       ORDER BY
         CASE WHEN s.owner_id = u.iduser THEN 0 ELSE 1 END,
         sm.joined_at ASC`,
      [serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── NEW: DELETE /servers/:serverId/members/:memberId  kick (owner only) ────
router.delete('/:serverId/members/:memberId', verifyUser, async (req, res) => {
  const { serverId, memberId } = req.params;
  try {
    const [servers] = await pool.query(
      'SELECT owner_id FROM servers WHERE idserver = ?',
      [serverId]
    );
    if (!servers.length)
      return res.status(404).json({ error: 'Server not found' });
    if (String(servers[0].owner_id) !== String(req.user.iduser))
      return res.status(403).json({ error: 'Forbidden: only the server owner can kick members' });
    if (String(memberId) === String(req.user.iduser))
      return res.status(400).json({ error: 'You cannot kick yourself' });

    await pool.query(
      'DELETE FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, memberId]
    );
    // Also clock out any active unit session for that user
    await pool.query(
      'DELETE FROM units WHERE server_id = ? AND user_id = ?',
      [serverId, memberId]
    );

    logAuditEvent(serverId, req.user.iduser, 'MEMBER_KICKED', 'user', Number(memberId), {})
      .catch(function () {});

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── NEW: DELETE /servers/:serverId/leave  leave a server (self) ─────────────
router.delete('/:serverId/leave', verifyUser, async (req, res) => {
  const { serverId } = req.params;
  try {
    const [servers] = await pool.query(
      'SELECT owner_id FROM servers WHERE idserver = ?',
      [serverId]
    );
    if (!servers.length)
      return res.status(404).json({ error: 'Server not found' });
    if (String(servers[0].owner_id) === String(req.user.iduser))
      return res.status(400).json({ error: 'Owners cannot leave their own server. Delete it instead.' });

    await pool.query(
      'DELETE FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.iduser]
    );
    await pool.query(
      'DELETE FROM units WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.iduser]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /servers/members  add member directly
router.post('/members', async (req, res) => {
  const { userId, serverId } = req.body;
  if (!userId || !serverId)
    return res.status(400).json({ error: 'userId and serverId are required' });
  try {
    await pool.query(
      'INSERT IGNORE INTO server_members (user_id, server_id) VALUES (?, ?)',
      [userId, serverId]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /servers/join  join by code
router.post('/join', verifyUser, async (req, res) => {
  const { joinCode } = req.body;
  if (!joinCode) return res.status(400).json({ error: 'joinCode is required' });

  try {
    const [servers] = await pool.query(
      'SELECT * FROM servers WHERE join_code = ?',
      [joinCode.trim().toUpperCase()]
    );
    if (!servers.length)
      return res.status(404).json({ error: 'Invalid join code – server not found' });

    const server = servers[0];

    await pool.query(
      'INSERT IGNORE INTO server_members (user_id, server_id) VALUES (?, ?)',
      [req.user.iduser, server.idserver]
    );

    res.json(server);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /servers/create
router.post('/create', verifyUser, async (req, res) => {
  const { name, description, iconUrl, joinCode, discordId } = req.body;
  if (!name) return res.status(400).json({ error: 'Server name is required' });

  const code = joinCode?.trim().toUpperCase() || generateJoinCode();

  try {
    if (discordId) {
      const [existing] = await pool.query(
        'SELECT idserver FROM servers WHERE discord_id = ?',
        [discordId]
      );
      if (existing.length > 0)
        return res.status(409).json({ error: 'This Discord server is already linked to a CAD server' });
    }

    const [result] = await pool.query(
      `INSERT INTO servers (name, description, icon_url, join_code, discord_id, owner_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description || null, iconUrl || null, code, discordId || null, req.user.iduser]
    );

    await pool.query(
      'INSERT IGNORE INTO server_members (user_id, server_id) VALUES (?, ?)',
      [req.user.iduser, result.insertId]
    );

    const [rows] = await pool.query('SELECT * FROM servers WHERE idserver = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /servers/my-servers  list servers for the authenticated user
router.get('/my-servers', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, sm.joined_at,
              CASE WHEN s.owner_id = ? THEN 'Owner' ELSE 'Member' END AS role,
              (SELECT COUNT(*) FROM server_members sm2 WHERE sm2.server_id = s.idserver) AS member_count
       FROM servers s
       INNER JOIN server_members sm ON sm.server_id = s.idserver
       WHERE sm.user_id = ?
       ORDER BY sm.joined_at DESC`,
      [req.user.iduser, req.user.iduser]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /servers/:serverId/update
router.patch('/:serverId/update', verifyUser, async (req, res) => {
  const { name, description, joinCode, discordId, iconUrl, erlcServerKey, auditWebhookUrl } = req.body;
  const { serverId } = req.params;

  try {
    const [servers] = await pool.query(
      'SELECT * FROM servers WHERE idserver = ? AND owner_id = ?',
      [serverId, req.user.iduser]
    );
    if (!servers.length) return res.status(403).json({ error: 'Forbidden: not the server owner' });

    // Encrypt the ERLC key before it ever touches the database.
    const erlcKeyToStore = erlcServerKey ? encryptSecret(erlcServerKey) : null;

    // Handle webhook URL clearing: if the field is empty string in the request body,
    // explicitly set it to NULL in the database.
    const auditWebhookValue = 'auditWebhookUrl' in req.body
      ? (auditWebhookUrl || null)
      : undefined;

    const setClauses = [
      'name      = COALESCE(?, name)',
      'description = COALESCE(?, description)',
      'join_code = COALESCE(?, join_code)',
      'discord_id = COALESCE(?, discord_id)',
      'erlc_server_key = COALESCE(?, erlc_server_key)',
      'icon_url  = COALESCE(?, icon_url)',
    ];
    const params = [name || null, description || null, joinCode || null, discordId || null, erlcKeyToStore, iconUrl || null];

    if (auditWebhookValue !== undefined) {
      setClauses.push('audit_webhook_url = ?');
      params.push(auditWebhookValue);
    }

    const whereClause = 'WHERE idserver = ?';
    params.push(serverId);

    await pool.query(
      `UPDATE servers SET ${setClauses.join(', ')} ${whereClause}`,
      params
    );

    const [rows] = await pool.query('SELECT * FROM servers WHERE idserver = ?', [serverId]);
    const server = rows[0];
    // Never send the (encrypted) key back to the client — only whether one is set.
    server.hasErlcKey = !!server.erlc_server_key;
    delete server.erlc_server_key;

    res.json(server);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /servers/:serverId  delete server (owner only) – used by server-settings
router.delete('/:serverId', verifyUser, async (req, res) => {
  const { serverId } = req.params;
  try {
    const [servers] = await pool.query(
      'SELECT owner_id FROM servers WHERE idserver = ?',
      [serverId]
    );
    if (!servers.length)
      return res.status(404).json({ error: 'Server not found' });
    if (String(servers[0].owner_id) !== String(req.user.iduser))
      return res.status(403).json({ error: 'Forbidden: only the owner can delete this server' });

    await pool.query('DELETE FROM servers WHERE idserver = ?', [serverId]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
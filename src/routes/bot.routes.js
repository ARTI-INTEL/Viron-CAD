/**
 * bot.routes.js  Ultimate CAD – Discord Bot API
 *
 * Internal REST endpoints consumed exclusively by the standalone Discord bot.
 * All routes are protected by a shared secret (DISCORD_BOT_SECRET) sent via
 * the `x-bot-secret` header — no user JWT required.
 *
 * Mounted at /bot-api
 *
 * Endpoints:
 *   GET /bot-api/link-status/:discordId
 *     → Returns the CAD user linked to a Discord account (or null)
 *
 *   GET /bot-api/units/:discordGuildId
 *     → Returns all currently active (clocked-in) units for the CAD server
 *       linked to the given Discord guild
 *
 *   GET /bot-api/dept-role-sync/:discordGuildId
 *     → Returns all department members with their dept name, type, and rank
 *       for role-syncing on the Discord guild
 *
 *   GET /bot-api/server-link/:discordGuildId
 *     → Returns the linked CAD server name (or 404 if no server is linked)
 *
 *   GET /bot-api/members/:discordGuildId
 *     → Returns all members of the linked CAD server (with role and Discord link)
 */

import { Router } from 'express';
import pool from '../db.js';
import { verifyBotSecret } from '../middleware/bot.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

/* ── All routes require the shared bot secret ─────────────── */
router.use(verifyBotSecret);

/* ── GET /bot-api/link-status/:discordId ──────────────────────
 *  Returns the CAD user linked to this Discord account.
 *  Users are linked automatically during Discord OAuth login
 *  (discord_id is stored on the users table).
 */
router.get('/link-status/:discordId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT iduser, username FROM users WHERE discord_id = ?',
      [req.params.discordId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/units/:discordGuildId ────────────────────────
 *  Returns active (clocked-in) units for the CAD server linked to
 *  the given Discord guild via servers.discord_id.
 *
 *  Uses a subquery to get only the LATEST unit row per user (in case
 *  they have old clocked-out rows), then filters for clocked_in = 1.
 */
router.get('/units/:discordGuildId', async (req, res) => {
  try {
    const [servers] = await pool.query(
      'SELECT idserver FROM servers WHERE discord_id = ?',
      [req.params.discordGuildId]
    );
    if (!servers.length) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const [rows] = await pool.query(
      `SELECT u.callsign, u.name, u.department, u.status
       FROM units u
       INNER JOIN (
         SELECT MAX(id) AS id FROM units WHERE server_id = ? GROUP BY user_id
       ) latest ON latest.id = u.id
       WHERE u.clocked_in = 1
       ORDER BY u.department, u.callsign`,
      [servers[0].idserver]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/dept-role-sync/:discordGuildId ───────────────
 *  Returns all department members (with their dept name, type, and
 *  rank name) for the CAD server linked to the given Discord guild.
 *
 *  Designed to be consumed by the bot's role-sync loop: the bot can
 *  diff these results against Discord guild roles and add/remove
 *  roles accordingly.
 */
router.get('/dept-role-sync/:discordGuildId', async (req, res) => {
  try {
    const [servers] = await pool.query(
      'SELECT idserver FROM servers WHERE discord_id = ?',
      [req.params.discordGuildId]
    );
    if (!servers.length) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const [rows] = await pool.query(
      `SELECT u.discord_id,
              d.name      AS dept_name,
              d.type      AS dept_type,
              dr.name     AS rank_name
       FROM dept_members dm
       JOIN users        u  ON u.iduser  = dm.user_id
       JOIN departments  d  ON d.id      = dm.dept_id
       LEFT JOIN dept_ranks dr ON dr.id  = dm.rank_id
       WHERE d.server_id = ?
         AND u.discord_id IS NOT NULL`,
      [servers[0].idserver]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/server-link/:discordGuildId ─────────────────
 *  Check if this Discord guild is linked to any Ultimate CAD server.
 *  Returns basic server info so the bot can display it.
 */
router.get('/server-link/:discordGuildId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT idserver, name, description, icon_url, join_code, owner_id FROM servers WHERE discord_id = ?',
      [req.params.discordGuildId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/members/:discordGuildId ──────────────────────
 *  Returns all server members with their username, role (Owner/Member),
 *  linked Discord ID, and join date for the CAD server linked to
 *  the given Discord guild.
 */
router.get('/members/:discordGuildId', async (req, res) => {
  try {
    const [servers] = await pool.query(
      'SELECT idserver, name, owner_id FROM servers WHERE discord_id = ?',
      [req.params.discordGuildId]
    );
    if (!servers.length) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const server = servers[0];

    const [rows] = await pool.query(
      `SELECT
         u.iduser,
         u.username,
         u.discord_id,
         sm.joined_at,
         CASE WHEN s.owner_id = u.iduser THEN 'Owner' ELSE 'Member' END AS role
       FROM server_members sm
       JOIN users   u ON u.iduser   = sm.user_id
       JOIN servers s ON s.idserver = sm.server_id
       WHERE sm.server_id = ?
       ORDER BY
         CASE WHEN s.owner_id = u.iduser THEN 0 ELSE 1 END,
         sm.joined_at ASC`,
      [server.idserver]
    );

    res.json({
      serverName: server.name,
      ownerId: server.owner_id,
      members: rows,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

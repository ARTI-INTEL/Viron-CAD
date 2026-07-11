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
 *
 *   GET /bot-api/calls/:discordGuildId
 *     → Returns all active calls with assigned units
 *
 *   GET /bot-api/bolos/:discordGuildId
 *     → Returns all active BOLOs
 *
 *   GET /bot-api/onduty/:discordGuildId/:discordId
 *     → Returns unit status for a specific Discord user (or null)
 *
 *   GET /bot-api/dept-roster/:discordGuildId?deptName=X
 *     → Returns members + ranks for a specific department
 *
 *   GET /bot-api/infractions/:discordGuildId/:discordId?deptId=X
 *     → Returns infraction history for a user (optionally filtered by dept)
 *
 *   GET /bot-api/activity/:discordGuildId/:discordId
 *     → Returns weekly activity stats for a user across all their depts
 *
 *   GET /bot-api/audit-log/:discordGuildId?limit=N&discordId=X
 *     → Returns recent audit events (owner-only; discordId must match owner)
 *
 *   GET /bot-api/join-code/:discordGuildId?discordId=X
 *     → Returns the join code (owner-only; discordId must match owner)
 *
 *   GET /bot-api/lookup/plate/:discordGuildId/:plate
 *     → Search vehicles by plate (or partial plate)
 *
 *   GET /bot-api/lookup/person/:discordGuildId/:query
 *     → Search characters by name
 */

import { Router } from 'express';
import pool from '../db.js';
import { verifyBotSecret } from '../middleware/bot.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

/* ── All routes require the shared bot secret ─────────────── */
router.use(verifyBotSecret);

/* ── Helper: resolve Discord guild ID → CAD server ───────── */
async function resolveServer(discordGuildId) {
  const [rows] = await pool.query(
    'SELECT idserver, name, owner_id FROM servers WHERE discord_id = ?',
    [discordGuildId]
  );
  return rows.length ? rows[0] : null;
}

/* ── Helper: resolve Discord user ID → CAD user ──────────── */
async function resolveUser(discordId) {
  const [rows] = await pool.query(
    'SELECT iduser, username FROM users WHERE discord_id = ?',
    [discordId]
  );
  return rows.length ? rows[0] : null;
}

// ══════════════════════════════════════════════════════════════
//  EXISTING ENDPOINTS
// ══════════════════════════════════════════════════════════════

/* ── GET /bot-api/link-status/:discordId ──────────────────────
 *  Returns the CAD user linked to this Discord account.
 */
router.get('/link-status/:discordId', async (req, res) => {
  try {
    const user = await resolveUser(req.params.discordId);
    res.json(user || null);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/units/:discordGuildId ──────────────────────── */
router.get('/units/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
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
      [server.idserver]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/dept-role-sync/:discordGuildId ─────────────── */
router.get('/dept-role-sync/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
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
      [server.idserver]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/server-link/:discordGuildId ───────────────── */
router.get('/server-link/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const [rows] = await pool.query(
      'SELECT idserver, name, description, icon_url, join_code, owner_id FROM servers WHERE idserver = ?',
      [server.idserver]
    );
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/members/:discordGuildId ────────────────────── */
router.get('/members/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

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

    res.json({ serverName: server.name, ownerId: server.owner_id, members: rows });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ══════════════════════════════════════════════════════════════
//  NEW: DISPATCH / OPS VISIBILITY
// ══════════════════════════════════════════════════════════════

/* ── GET /bot-api/calls/:discordGuildId ────────────────────────
 *  Active calls with assigned units for the linked CAD server.
 */
router.get('/calls/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const [rows] = await pool.query(
      `SELECT c.id, c.nature, c.location, c.priority, c.status, c.created_at,
              GROUP_CONCAT(o.callsign SEPARATOR ', ') AS units
       FROM calls c
       LEFT JOIN units o ON o.current_call = c.id
       WHERE c.server_id = ? AND c.status = 'ACTIVE'
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [server.idserver]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/deployments/:discordGuildId ─────────────────
 *  Active calls with their assigned unit details for the linked CAD server.
 *  Returns each call with an array of attached units.
 */
router.get('/deployments/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const [rows] = await pool.query(
      `SELECT c.id AS call_id, c.nature, c.location, c.priority, c.created_at,
              u.callsign, u.name AS unit_name, u.department, u.status
       FROM calls c
       LEFT JOIN units u ON u.current_call = c.id
       WHERE c.server_id = ? AND c.status = 'ACTIVE'
       ORDER BY c.created_at DESC, u.callsign ASC`,
      [server.idserver]
    );

    // Group units under their calls
    const callMap = {};
    const callOrder = [];

    rows.forEach((row) => {
      if (!callMap[row.call_id]) {
        callMap[row.call_id] = {
          call_id: row.call_id,
          nature: row.nature,
          location: row.location,
          priority: row.priority,
          created_at: row.created_at,
          units: [],
        };
        callOrder.push(callMap[row.call_id]);
      }
      if (row.callsign) {
        callMap[row.call_id].units.push({
          callsign: row.callsign,
          name: row.unit_name,
          department: row.department,
          status: row.status,
        });
      }
    });

    res.json({ deployments: callOrder, totalCalls: callOrder.length });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/bolos/:discordGuildId ────────────────────────
 *  Active BOLOs for the linked CAD server.
 */
router.get('/bolos/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const [rows] = await pool.query(
      'SELECT id, type, reason, description, created_at FROM bolos WHERE server_id = ? AND active = 1 ORDER BY created_at DESC',
      [server.idserver]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/onduty/:discordGuildId/:discordId ────────────
 *  Check if a specific Discord user is currently clocked in.
 *  Returns unit info or null.
 */
router.get('/onduty/:discordGuildId/:discordId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const user = await resolveUser(req.params.discordId);
    if (!user) {
      return res.json(null);
    }

    const [rows] = await pool.query(
      `SELECT callsign, name, department, status, current_call
       FROM units
       WHERE user_id = ? AND server_id = ? AND clocked_in = 1
       ORDER BY id DESC
       LIMIT 1`,
      [user.iduser, server.idserver]
    );
    res.json(rows.length ? rows[0] : null);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ══════════════════════════════════════════════════════════════
//  NEW: DEPARTMENT MANAGEMENT
// ══════════════════════════════════════════════════════════════

/* ── GET /bot-api/dept-roster/:discordGuildId ──────────────────
 *  Query param: deptName (required) — exact match on department name.
 *  Returns members with their rank for the specified department.
 */
router.get('/dept-roster/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const deptName = req.query.deptName;
    if (!deptName) {
      return res.status(400).json({ error: 'Query parameter deptName is required' });
    }

    const [dept] = await pool.query(
      'SELECT id, name, type FROM departments WHERE server_id = ? AND name = ?',
      [server.idserver, deptName]
    );
    if (!dept.length) {
      return res.status(404).json({ error: `Department "${deptName}" not found` });
    }

    const [rows] = await pool.query(
      `SELECT dm.id AS member_id, u.username, u.discord_id, dr.name AS rank_name
       FROM dept_members dm
       JOIN users        u  ON u.iduser   = dm.user_id
       LEFT JOIN dept_ranks dr ON dr.id   = dm.rank_id
       WHERE dm.dept_id = ?
       ORDER BY dr.name ASC, u.username ASC`,
      [dept[0].id]
    );

    res.json({ deptName: dept[0].name, deptType: dept[0].type, members: rows });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/infractions/:discordGuildId/:discordId ───────
 *  Query param: deptId (optional) — filter by department.
 *  Returns infraction history for a CAD user identified by their Discord ID.
 */
router.get('/infractions/:discordGuildId/:discordId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const user = await resolveUser(req.params.discordId);
    if (!user) {
      return res.json({ infractions: [], total: 0 });
    }

    let sql = `SELECT di.id, di.reason, di.created_at, di.dept_id, d.name AS dept_name,
                      u.username AS given_by_name
               FROM dept_infractions di
               JOIN departments d ON d.id = di.dept_id
               LEFT JOIN users u ON u.iduser = di.given_by_user_id
               WHERE di.member_id IN (
                 SELECT id FROM dept_members WHERE user_id = ? AND dept_id IN (
                   SELECT id FROM departments WHERE server_id = ?
                 )
               )`;
    const params = [user.iduser, server.idserver];

    if (req.query.deptId) {
      sql += ' AND di.dept_id = ?';
      params.push(req.query.deptId);
    }

    sql += ' ORDER BY di.created_at DESC LIMIT 50';

    const [rows] = await pool.query(sql, params);
    res.json({ infractions: rows, total: rows.length });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/activity/:discordGuildId/:discordId ──────────
 *  Returns weekly activity stats for a user across all their departments.
 */
router.get('/activity/:discordGuildId/:discordId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const user = await resolveUser(req.params.discordId);
    if (!user) {
      return res.json([]);
    }

    const [rows] = await pool.query(
      `SELECT d.id AS dept_id, d.name AS dept_name, d.type AS dept_type,
              COUNT(dal.id) AS activity_count
       FROM dept_activity_log dal
       JOIN departments d ON d.id = dal.dept_id
       WHERE dal.user_id = ? AND d.server_id = ?
         AND dal.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY d.id, d.name, d.type
       ORDER BY activity_count DESC`,
      [user.iduser, server.idserver]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ══════════════════════════════════════════════════════════════
//  NEW: SERVER ADMINISTRATION
// ══════════════════════════════════════════════════════════════

/* ── GET /bot-api/audit-log/:discordGuildId ────────────────────
 *  Query params: limit (default 20, max 100), discordId (required — must match server owner).
 *  Returns recent audit events. Only the server owner can access.
 */
router.get('/audit-log/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    // Verify the requesting user is the server owner
    const requester = req.query.discordId ? await resolveUser(req.query.discordId) : null;
    if (!requester || String(requester.iduser) !== String(server.owner_id)) {
      return res.status(403).json({ error: 'Forbidden: only the CAD server owner can view the audit log' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [rows] = await pool.query(
      `SELECT sal.id, sal.action, sal.target_type, sal.target_id, sal.details, sal.created_at,
              u.username
       FROM server_audit_log sal
       JOIN users u ON u.iduser = sal.user_id
       WHERE sal.server_id = ?
       ORDER BY sal.created_at DESC
       LIMIT ?`,
      [server.idserver, limit]
    );

    const [countRow] = await pool.query(
      'SELECT COUNT(*) AS total FROM server_audit_log WHERE server_id = ?',
      [server.idserver]
    );

    res.json({ events: rows, total: countRow[0].total, limit });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/join-code/:discordGuildId ────────────────────
 *  Query param: discordId (required — must match server owner).
 *  Returns the current join code.
 */
router.get('/join-code/:discordGuildId', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const requester = req.query.discordId ? await resolveUser(req.query.discordId) : null;
    if (!requester || String(requester.iduser) !== String(server.owner_id)) {
      return res.status(403).json({ error: 'Forbidden: only the CAD server owner can view the join code' });
    }

    const [rows] = await pool.query(
      'SELECT join_code FROM servers WHERE idserver = ?',
      [server.idserver]
    );

    res.json({ joinCode: rows[0].join_code, serverName: server.name });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ══════════════════════════════════════════════════════════════
//  NEW: RECORDS LOOKUPS
// ══════════════════════════════════════════════════════════════

/* ── GET /bot-api/lookup/plate/:discordGuildId/:plate ──────────
 *  Searches for vehicles by plate (partial match).
 *  Returns vehicle details with owner name.
 */
router.get('/lookup/plate/:discordGuildId/:plate', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const like = `%${req.params.plate}%`;
    const [rows] = await pool.query(
      `SELECT v.id, v.plate, v.vin, v.model, v.color, v.registered,
              CONCAT(c.first_name, ' ', c.last_name) AS owner_name,
              c.id AS owner_id
       FROM vehicles v
       LEFT JOIN characters c ON c.id = v.owner_id
       WHERE v.server_id = ? AND (v.plate LIKE ? OR v.vin LIKE ?)
       ORDER BY v.plate ASC
       LIMIT 10`,
      [server.idserver, like, like]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bot-api/lookup/person/:discordGuildId/:query ─────────
 *  Searches for characters by name (partial match on first, last, or full).
 *  Returns character details with linked vehicles and firearms.
 */
router.get('/lookup/person/:discordGuildId/:query', async (req, res) => {
  try {
    const server = await resolveServer(req.params.discordGuildId);
    if (!server) {
      return res.status(404).json({ error: 'No CAD server linked to this Discord guild' });
    }

    const like = `%${req.params.query}%`;
    const [chars] = await pool.query(
      `SELECT c.id, c.first_name, c.last_name, c.dob, c.address, c.phone, c.notes
       FROM characters c
       WHERE c.server_id = ?
         AND (c.first_name LIKE ? OR c.last_name LIKE ? OR CONCAT(c.first_name, ' ', c.last_name) LIKE ?)
       ORDER BY c.last_name ASC
       LIMIT 10`,
      [server.idserver, like, like, like]
    );

    // Batch-fetch vehicles and firearms for matched characters
    if (chars.length) {
      const charIds = chars.map((c) => c.id);

      const [vehicles] = await pool.query(
        `SELECT id, plate, model, color, owner_id FROM vehicles WHERE server_id = ? AND owner_id IN (?)`,
        [server.idserver, charIds]
      );
      const [firearms] = await pool.query(
        `SELECT id, serial, model, owner_id FROM firearms WHERE server_id = ? AND owner_id IN (?)`,
        [server.idserver, charIds]
      );

      const vehMap = {};
      vehicles.forEach((v) => {
        if (!vehMap[v.owner_id]) vehMap[v.owner_id] = [];
        vehMap[v.owner_id].push(v);
      });
      const faMap = {};
      firearms.forEach((f) => {
        if (!faMap[f.owner_id]) faMap[f.owner_id] = [];
        faMap[f.owner_id].push(f);
      });

      chars.forEach((c) => {
        c.vehicles = vehMap[c.id] || [];
        c.firearms = faMap[c.id] || [];
      });
    }

    res.json(chars);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

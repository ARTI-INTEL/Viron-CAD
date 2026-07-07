/**
 * temp-characters.routes.js
 *
 * Manages temporary characters auto-generated when a player joins
 * the ERLC server. Temp chars live in a separate table from regular
 * characters and are auto-removed when the player leaves.
 *
 * Features:
 *   - Auto-create temp character + license + vehicle on ERLC join
 *   - Auto-remove on ERLC leave
 *   - Separate table (temp_characters) from regular characters
 *   - Toggle-able via servers.auto_temp_chars
 */

import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';
import { decryptSecret } from '../utility/crypto.js';

const router = Router();

/* ── Helpers ──────────────────────────────────────────────── */

/** Generate a random license number like "LIC-XXXXXX" */
function generateLicense() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `LIC-${code}`;
}

/** Generate a random plate number like "XXX-1234" */
function generatePlate() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let l = '';
  for (let i = 0; i < 3; i++) l += letters.charAt(Math.floor(Math.random() * letters.length));
  const nums = Math.floor(1000 + Math.random() * 9000);
  return `${l}-${nums}`;
}

/** Generate a random first name */
const FIRST_NAMES = [
  'James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda',
  'David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica',
  'Thomas','Sarah','Christopher','Karen','Charles','Lisa','Daniel','Nancy',
  'Matthew','Betty','Anthony','Margaret','Mark','Sandra',
];

/** Generate a random last name */
const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
  'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson',
  'Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson',
  'White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
];

/** Vehicle models for random assignment */
const VEHICLE_MODELS = [
  'Sedan','SUV','Coupe','Truck','Van','Motorcycle','Sports Car',
  'Pickup','Minivan','Convertible','Hatchback','Crossover',
];

/** Vehicle colors for random assignment */
const VEHICLE_COLORS = [
  'Black','White','Silver','Blue','Red','Gray','Green','Yellow',
  'Orange','Purple','Brown','Gold','Dark Blue','Dark Red',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ── GET /temp-chars/:serverId — list temp chars ──────────── */
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM temp_characters WHERE server_id = ? ORDER BY created_at DESC',
      [req.params.serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /temp-chars/:serverId/mine — my temp chars ──────── */
router.get('/:serverId/mine', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM temp_characters WHERE server_id = ? AND user_id = ? ORDER BY created_at DESC',
      [req.params.serverId, req.user.iduser]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── POST /temp-chars/create — auto-create temp char ────────
   Called internally (or via ERLC join detection) to create a
   temporary character + license + vehicle for a new player.    */
router.post('/create', verifyUser, verifyMember, async (req, res) => {
  const { serverId } = req.body;
  if (!serverId) return res.status(400).json({ error: 'serverId is required' });

  try {
    // Check if feature is enabled
    const [srv] = await pool.query(
      'SELECT auto_temp_chars FROM servers WHERE idserver = ?',
      [serverId]
    );
    if (!srv.length || !srv[0].auto_temp_chars)
      return res.status(400).json({ error: 'Auto temp characters are not enabled on this server' });

    // Check if user already has a temp char
    const [existing] = await pool.query(
      'SELECT id FROM temp_characters WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.iduser]
    );
    if (existing.length) {
      return res.json({ message: 'Temp character already exists', id: existing[0].id });
    }

    const firstName = randomFrom(FIRST_NAMES);
    const lastName  = randomFrom(LAST_NAMES);
    const license   = generateLicense();
    const plate     = generatePlate();
    const vehicleModel = randomFrom(VEHICLE_MODELS);
    const vehicleColor = randomFrom(VEHICLE_COLORS);

    const [result] = await pool.query(
      `INSERT INTO temp_characters
         (server_id, user_id, first_name, last_name, license, plate, vehicle_model, vehicle_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [serverId, req.user.iduser, firstName, lastName, license, plate, vehicleModel, vehicleColor]
    );

    const [rows] = await pool.query('SELECT * FROM temp_characters WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── POST /temp-chars/remove — auto-remove temp char ────────
   Called when a player leaves the ERLC server.                 */
router.post('/remove', verifyUser, async (req, res) => {
  const { serverId } = req.body;
  if (!serverId) return res.status(400).json({ error: 'serverId is required' });

  try {
    const [result] = await pool.query(
      'DELETE FROM temp_characters WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.iduser]
    );
    res.json({ success: true, removed: result.affectedRows });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── POST /temp-chars/auto-sync — ERLC join/leave sync ──────
   Called by the ERLC poller. Compares current ERLC players
   against temp chars and creates/removes as needed.            */
router.post('/auto-sync/:serverId', verifyUser, verifyMember, async (req, res) => {
  const { serverId } = req.params;

  try {
    // Check if feature is enabled
    const [srv] = await pool.query(
      'SELECT auto_temp_chars FROM servers WHERE idserver = ?',
      [serverId]
    );
    if (!srv.length || !srv[0].auto_temp_chars)
      return res.json({ created: 0, removed: 0, message: 'Feature not enabled' });      // Fetch current ERLC players using the server's ERLC key
      const [keyRows] = await pool.query(
      'SELECT erlc_server_key FROM servers WHERE idserver = ?',
      [serverId]
    );
    const encryptedKey = keyRows[0]?.erlc_server_key;
    if (!encryptedKey) return res.json({ created: 0, removed: 0, message: 'No ERLC key' });

    const apiKey = decryptSecret(encryptedKey);
    if (!apiKey) return res.json({ created: 0, removed: 0 });

    const erlcRes = await fetch(`https://api.erlc.gg/v2/server?Players=true`, {
      headers: {
        'server-key': apiKey,
        'Accept': 'application/json',
      },
    });
    if (!erlcRes.ok) return res.json({ created: 0, removed: 0 });

    const data = await erlcRes.json();
    const players = data?.Players || [];

    // Get all CAD users with roblox usernames linked
    const [allUsers] = await pool.query(
      'SELECT iduser, roblox_username FROM users WHERE roblox_username IS NOT NULL'
    );

    // Map ERLC player names to CAD user IDs
    const onlineUserIds = new Set();
    const nameToUser = {};
    allUsers.forEach(u => {
      if (u.roblox_username) {
        nameToUser[u.roblox_username.toLowerCase()] = String(u.iduser);
      }
    });

    players.forEach(p => {
      const playerNameRaw = String(p.Player || p.player || '').split(':')[0].trim().toLowerCase();
      if (nameToUser[playerNameRaw]) {
        onlineUserIds.add(nameToUser[playerNameRaw]);
      }
    });

    // Get existing temp chars for this server
    const [tempChars] = await pool.query(
      'SELECT user_id FROM temp_characters WHERE server_id = ?',
      [serverId]
    );
    const existingUserIds = new Set(tempChars.map(t => String(t.user_id)));

    let created = 0;
    let removed = 0;

    // Create chars for online players who don't have one
    for (const userId of onlineUserIds) {
      if (!existingUserIds.has(userId)) {
        const firstName = randomFrom(FIRST_NAMES);
        const lastName  = randomFrom(LAST_NAMES);
        const license   = generateLicense();
        const plate     = generatePlate();
        await pool.query(
          `INSERT INTO temp_characters
             (server_id, user_id, first_name, last_name, license, plate, vehicle_model, vehicle_color)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [serverId, Number(userId), firstName, lastName, license, plate,
           randomFrom(VEHICLE_MODELS), randomFrom(VEHICLE_COLORS)]
        );
        created++;
      }
    }

    // Remove chars for offline players
    for (const userId of existingUserIds) {
      if (!onlineUserIds.has(userId)) {
        await pool.query(
          'DELETE FROM temp_characters WHERE server_id = ? AND user_id = ?',
          [serverId, Number(userId)]
        );
        removed++;
      }
    }

    res.json({ created, removed });
  } catch (err) {
    logError('[TempChars sync]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

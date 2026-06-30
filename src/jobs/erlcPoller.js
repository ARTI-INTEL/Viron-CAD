/**
 * erlcPoller.js  Ultimate CAD – ERLC API Proxy
 *
 * Proxies requests to https://api.erlc.gg/v2/
 * using the per-server ERLC key stored in the DB.
 *
 * Endpoints added in this revision:
 *   GET  /erlc/:serverId/live-units       – ERLC players merged with CAD units
 *   GET  /erlc/:serverId/emergency-calls  – In-game 911 / emergency calls
 *   POST /erlc/:serverId/import-call      – Import an ERLC call into the CAD
 */

import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember, verifyUnit } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();
const ERLC_BASE = 'https://api.erlc.gg';

/* ── Helpers ──────────────────────────────────────────────── */

async function getServerKey(serverId) {
  const [rows] = await pool.query(
    'SELECT erlc_server_key FROM servers WHERE idserver = ?',
    [serverId]
  );
  return rows[0]?.erlc_server_key || null;
}

async function erlcFetch(key, path, opts = {}) {
  const res = await fetch(`${ERLC_BASE}${path}`, {
    ...opts,
    headers: {
      'server-key': key,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(opts.headers || {}),
    },
  });

  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = body?.message || body?.error || `ERLC API error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

function makeQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

function playerName(value) {
  return String(value || '').split(':')[0].trim();
}

function normalizePlayer(player) {
  if (!player || typeof player !== 'object') return player;
  const location = player.Location || player.location || {};
  const x = location.LocationX ?? location.x ?? location.X ?? player.Position?.x ?? player.position?.x;
  const z = location.LocationZ ?? location.z ?? location.Z ?? player.Position?.z ?? player.position?.z;
  return {
    ...player,
    Player: player.Player || player.player || '',
    PlayerName: playerName(player.Player || player.player),
    Team: player.Team || player.team || '',
    Callsign: player.Callsign || player.callsign || null,
    Location: location,
    Position: Number.isFinite(Number(x)) && Number.isFinite(Number(z))
      ? { x: Number(x), z: Number(z) }
      : null,
  };
}

function normalizePlayers(data) {
  const players = Array.isArray(data) ? data : (data?.Players || data?.players || []);
  return players.map(normalizePlayer);
}

function normalizeEmergencyCall(call, index = 0) {
  const position = call?.Position || call?.position || null;
  const posX = Array.isArray(position) ? position[0] : (position?.x ?? position?.LocationX);
  const posZ = Array.isArray(position) ? position[1] : (position?.z ?? position?.LocationZ);
  const callNumber = call?.CallNumber ?? call?.CallId ?? call?.Id ?? call?.id ?? call?.StartedAt ?? index + 1;
  const hasPosition = Number.isFinite(Number(posX)) && Number.isFinite(Number(posZ));
  const descriptor = call?.PositionDescriptor || call?.Location || call?.location || '';
  const location = descriptor
    ? (hasPosition ? `${descriptor} (${Number(posX)}, ${Number(posZ)})` : descriptor)
    : (hasPosition ? `${Math.round(Number(posX))}, ${Math.round(Number(posZ))}` : 'Unknown');

  return {
    erlcCallId: String(callNumber),
    caller: call?.Caller != null ? String(call.Caller) : (call?.Player || 'Unknown'),
    nature: call?.Description || call?.Nature || call?.CallType || 'Emergency',
    location: String(location || 'Unknown'),
    status: call?.Status || 'Pending',
    rawPosition: hasPosition
      ? { x: Number(posX), z: Number(posZ) }
      : null,
    priority: call?.Priority || 'High',
    raw: call,
  };
}

async function fetchServerInfo(key, params = {}) {
  return erlcFetch(key, `/v2/server${makeQuery(params)}`);
}

function erlcHandler(path, method = 'GET', bodyFn = null) {
  return async (req, res) => {
    try {
      const key = await getServerKey(req.params.serverId);
      if (!key)
        return res.status(400).json({ error: 'No ERLC server key configured. Add it in Server Settings.' });

      const opts = { method };
      if (bodyFn) opts.body = JSON.stringify(bodyFn(req));

      const data = await erlcFetch(key, path, opts);
      res.json(data ?? { success: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  };
}

/* ── Standard read-only endpoints ─────────────────────────── */

router.get('/:serverId/server', verifyUser, verifyMember, erlcHandler('/v2/server'));
router.get('/:serverId/players', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured. Add it in Server Settings.' });
    const data = await fetchServerInfo(key, { Players: true });
    res.json(normalizePlayers(data));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
router.get('/:serverId/joinlogs', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured. Add it in Server Settings.' });
    const data = await fetchServerInfo(key, { JoinLogs: true });
    res.json(data.JoinLogs || []);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
router.get('/:serverId/killlogs', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured. Add it in Server Settings.' });
    const data = await fetchServerInfo(key, { KillLogs: true });
    res.json(data.KillLogs || []);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
router.get('/:serverId/commandlogs', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured. Add it in Server Settings.' });
    const data = await fetchServerInfo(key, { CommandLogs: true });
    res.json(data.CommandLogs || []);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
router.get('/:serverId/vehicles', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured. Add it in Server Settings.' });
    const data = await fetchServerInfo(key, { Vehicles: true });
    res.json(data.Vehicles || []);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
router.get('/:serverId/queue', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured. Add it in Server Settings.' });
    const data = await fetchServerInfo(key, { Queue: true });
    res.json(data.Queue || []);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
router.get('/:serverId/staff', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured. Add it in Server Settings.' });
    const data = await fetchServerInfo(key, { Staff: true });
    res.json(data.Staff || {});
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────────────────── */
/*  NEW: GET /erlc/:serverId/live-units                        */
/*                                                             */
/*  Returns ERLC player list fused with clocked-in CAD units. */
/*  Matching is done by roblox_username == ERLC Player name.  */
/*  Response shape:                                            */
/*    { players: [...], units: [...], linked: [...] }          */
/*  where linked[i] = unit row + { erlcPlayer, position }     */
/* ─────────────────────────────────────────────────────────── */
router.get('/:serverId/live-units', verifyUser, verifyMember, async (req, res) => {
  const { serverId } = req.params;
  try {
    /* 1. Load CAD units for this server */
    const [units] = await pool.query(
      `SELECT u.id, u.user_id, u.name, u.callsign, u.department,
              u.status, u.location, u.current_call, u.clocked_in,
              us.roblox_username
       FROM units u
       LEFT JOIN users us ON us.iduser = u.user_id
       WHERE u.server_id = ?
       ORDER BY u.department, u.callsign`,
      [serverId]
    );

    /* 2. Try to fetch ERLC player list (graceful fail if no key) */
    const key = await getServerKey(serverId);
    let players = [];
    if (key) {
      const data = await fetchServerInfo(key, { Players: true }).catch(() => null);
      players = normalizePlayers(data);
    }

    /* 3. Match each CAD unit to an ERLC player by Roblox username */
    const linked = units.map((unit) => {
      const erlcPlayer = players.find(
        (p) =>
          p.Player &&
          unit.roblox_username &&
          playerName(p.Player).toLowerCase() === unit.roblox_username.toLowerCase()
      ) || null;

      return {
        ...unit,
        erlcPlayer,
        position: erlcPlayer?.Position || null,
      };
    });

    res.json({ players, units, linked });
  } catch (err) {
    logError('[live-units]', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────────────────── */
/*  NEW: GET /erlc/:serverId/emergency-calls                   */
/*                                                             */
/*  Returns active in-game 911 / emergency calls from ERLC.   */
/*  Falls back gracefully if the endpoint is unavailable or    */
/*  the server key is not configured.                          */
/*                                                             */
/*  Response: array of ERLC call objects, normalised to:       */
/*    { erlcCallId, caller, nature, location, status, rawPosition } */
/* ─────────────────────────────────────────────────────────── */
router.get('/:serverId/emergency-calls', verifyUser, verifyMember, async (req, res) => {
  const { serverId } = req.params;
  try {
    const key = await getServerKey(serverId);
    if (!key) return res.json([]);

    const data = await fetchServerInfo(key, { EmergencyCalls: true }).catch(() => null);
    const rawCalls = data?.EmergencyCalls || data?.emergencyCalls || [];

    if (rawCalls && Array.isArray(rawCalls) && rawCalls.length) {
      return res.json(rawCalls.map(normalizeEmergencyCall));
    }

    /* Fallback: parse command logs for 911 dispatch patterns */
    const logsData = await fetchServerInfo(key, { CommandLogs: true }).catch(() => null);
    const logs = logsData?.CommandLogs || [];
    const callPattern = /(?:911|emergency|dispatch|call)\s*[:\-–]?\s*(.+)/i;
    const parsed = [];
    logs.slice(0, 50).forEach((log, i) => {
      const match = (log.Command || log.Text || '').match(callPattern);
      if (match) {
        parsed.push({
          erlcCallId:  'LOG-' + i,
          caller:      log.Player || 'Unknown',
          nature:      'Emergency (log)',
          location:    match[1].trim().substring(0, 60),
          status:      'Pending',
          rawPosition: null,
        });
      }
    });

    res.json(parsed);
  } catch (err) {
    logError('[emergency-calls]', err);
    res.json([]); // always return an empty array rather than erroring
  }
});

/* ─────────────────────────────────────────────────────────── */
/*  NEW: POST /erlc/:serverId/import-call                      */
/*                                                             */
/*  Converts an ERLC emergency call into a CAD call.           */
/*  Body: { erlcCallId, caller, nature, location, priority }   */
/*  Requires the user to be clocked in as a unit.             */
/* ─────────────────────────────────────────────────────────── */
router.post('/:serverId/import-call', verifyUser, verifyUnit, async (req, res) => {
  const { serverId } = req.params;
  const { nature, location, priority } = req.body;

  if (!nature || !location)
    return res.status(400).json({ error: 'nature and location are required' });

  try {
    const [result] = await pool.query(
      `INSERT INTO calls (server_id, nature, location, priority)
       VALUES (?, ?, ?, ?)`,
      [serverId, nature, location, priority || 'Low']
    );
    const [rows] = await pool.query('SELECT * FROM calls WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    logError('[import-call]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── Moderation endpoints ──────────────────────────────────── */

router.post('/:serverId/bans', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured.' });
    const { UserIds, Reason, Duration } = req.body;
    if (!UserIds || !Reason)
      return res.status(400).json({ error: 'UserIds and Reason are required.' });
    const data = await erlcFetch(key, '/server/bans', {
      method: 'POST',
      body: JSON.stringify({ UserIds, Reason, Duration: Duration ?? null }),
    });
    res.json(data ?? { success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:serverId/bans', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured.' });
    const { UserIds } = req.body;
    if (!UserIds) return res.status(400).json({ error: 'UserIds is required.' });
    const data = await erlcFetch(key, '/server/bans', {
      method: 'DELETE',
      body: JSON.stringify({ UserIds }),
    });
    res.json(data ?? { success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:serverId/command', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key) return res.status(400).json({ error: 'No ERLC server key configured.' });
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'command is required.' });
    const data = await erlcFetch(key, '/v2/server/command', {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
    res.json(data ?? { success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* ── Key validation ───────────────────────────────────────── */

router.post('/:serverId/validate-key', verifyUser, verifyMember, async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'key is required.' });
  try {
    await fetchServerInfo(key);
    res.json({ valid: true });
  } catch (err) {
    res.json({ valid: false, reason: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════
// ADDITIONS FOR  src/jobs/erlcPoller.js
//
// Paste these route definitions BEFORE the final  export default router;
// line.  pool is already imported in that file.
// ═══════════════════════════════════════════════════════════════
 
// ── GET /erlc/:serverId/calls ────────────────────────────────
// Returns the current list of active 911 / dispatch calls from ERLC.
router.get('/:serverId/calls', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key)
      return res.status(400).json({ error: 'No ERLC server key configured. Add it in Server Settings.' });
 
    const data = await fetchServerInfo(key, { EmergencyCalls: true });
    const calls = data?.EmergencyCalls || data?.emergencyCalls || [];
    res.json(calls.map(normalizeEmergencyCall));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
 
// ── POST /erlc/:serverId/sync-calls ─────────────────────────
// Imports active ERLC 911 calls into the CAD database as ACTIVE calls.
// Deduplication: calls tagged [ERLC-<id>] in the `nature` column are
// not re-inserted on subsequent syncs.
router.post('/:serverId/sync-calls', verifyUser, verifyMember, async (req, res) => {
  const { serverId } = req.params;
 
  try {
    const key = await getServerKey(serverId);
    if (!key)
      return res.status(400).json({ error: 'No ERLC server key configured.' });
 
    // ── Fetch ERLC calls ──────────────────────────────────
    let erlcData;
    try {
      erlcData = await fetchServerInfo(key, { EmergencyCalls: true });
    } catch (err) {
      return res.json({ synced: 0, total: 0, message: err.message || 'ERLC emergency calls unavailable for this server key.' });
    }
 
    const erlcCalls = (erlcData?.EmergencyCalls || erlcData?.emergencyCalls || []).map(normalizeEmergencyCall);
 
    if (!erlcCalls.length) {
      return res.json({ synced: 0, total: 0 });
    }
 
    // ── Sync each call ────────────────────────────────────
    let synced = 0;
    for (const call of erlcCalls) {
      const erlcId   = String(call.erlcCallId || '');
      const nature   = String(call.nature || 'ERLC Call');
      const location = String(call.location || 'Unknown');
      const priority = call.priority || 'High';
 
      if (!erlcId) continue;
 
      const tag = `[ERLC-${erlcId}]`;
 
      // Check whether we already have an active CAD call for this ERLC call
      const [existing] = await pool.query(
        "SELECT id FROM calls WHERE server_id = ? AND nature LIKE ? AND status = 'ACTIVE'",
        [serverId, `${tag}%`]
      );
 
      if (!existing.length) {
        await pool.query(
          "INSERT INTO calls (server_id, nature, location, priority, status) VALUES (?, ?, ?, ?, 'ACTIVE')",
          [serverId, `${tag} ${nature}`, location, priority]
        );
        synced++;
      }
    }
 
    res.json({ synced, total: erlcCalls.length });
  } catch (err) {
    logError('[ERLC sync-calls]', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});
 
// ── GET /erlc/:serverId/players/positions ────────────────────
// Convenience endpoint: returns only players that have Position data,
// formatted for the CADMap module.
router.get('/:serverId/players/positions', verifyUser, verifyMember, async (req, res) => {
  try {
    const key = await getServerKey(req.params.serverId);
    if (!key)
      return res.json([]);
 
    const data = await fetchServerInfo(key, { Players: true });
    const all  = normalizePlayers(data);
 
    const withPos = all.filter(p => p.Position || p.position);
    res.json(withPos);
  } catch (err) {
    res.json([]);
  }
});
 
export default router;

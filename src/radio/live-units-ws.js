/**
 * live-units-ws.js  Ultimate CAD – Live Units WebSocket
 *
 * Provides a WebSocket endpoint that automatically streams ERLC
 * live unit positions to connected clients, eliminating the need
 * for frontend polling.
 *
 * Protocol:
 *   Client → Server: { type: "subscribe", serverId: "123", token: "jwt..." }
 *   Server → Client: { type: "live-units", data: { players, units, linked } }
 *   Server → Client: { type: "error", message: "..." }
 *
 * The server polls ERLC every 8 seconds and pushes updates to
 * all subscribed clients for that server.
 */

import { WebSocketServer } from 'ws';
import { verifyToken } from '../utility/jwt.js';
import { logError } from '../utility/logger.js';
import pool from '../db.js';
import { decryptSecret } from '../utility/crypto.js';

const ERLC_BASE = 'https://api.erlc.gg';

/* ── Per-server subscription state ────────────────────────── */
const subscriptions = new Map(); // serverId → Set<WebSocket>
const pollTimers   = new Map();  // serverId → intervalId

/**
 * Attach the live-units WebSocket to an HTTP server.
 * @param {import('http').Server} httpServer
 * @param {string} path - WebSocket path, e.g. "/live-units"
 */
export function attachLiveUnitsWs(httpServer, path) {
  const wss = new WebSocketServer({ server: httpServer, path: path || '/live-units' });

  wss.on('connection', function (ws) {
    ws._serverId = null;
    ws._authed   = false;

    ws.on('message', function (data) {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (err) {
        safeSend(ws, { type: 'error', message: 'Invalid message format' });
      }
    });

    ws.on('close', function () {
      unsubscribe(ws);
    });

    ws.on('error', function () {
      unsubscribe(ws);
    });
  });
}

/* ── Message handling ─────────────────────────────────────── */

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'subscribe':
      handleSubscribe(ws, msg);
      break;
    case 'unsubscribe':
      unsubscribe(ws);
      break;
    default:
      safeSend(ws, { type: 'error', message: 'Unknown message type' });
  }
}

async function handleSubscribe(ws, msg) {
  const { serverId, token } = msg;

  if (!serverId || !token) {
    safeSend(ws, { type: 'error', message: 'serverId and token are required' });
    return;
  }

  // Validate JWT
  const payload = verifyToken(token);
  if (!payload) {
    safeSend(ws, { type: 'error', message: 'Invalid token' });
    return;
  }

  // Check server membership
  try {
    const [rows] = await pool.query(
      'SELECT id FROM server_members WHERE user_id = ? AND server_id = ?',
      [payload.iduser, serverId]
    );
    if (!rows.length) {
      safeSend(ws, { type: 'error', message: 'You are not a member of this server' });
      return;
    }
  } catch (err) {
    safeSend(ws, { type: 'error', message: 'Auth error' });
    return;
  }

  // Unsubscribe from previous server if any
  if (ws._serverId) {
    unsubscribe(ws);
  }

  ws._serverId = serverId;
  ws._authed   = true;

  // Add to subscription set
  if (!subscriptions.has(serverId)) {
    subscriptions.set(serverId, new Set());
  }
  subscriptions.get(serverId).add(ws);

  // Start polling for this server if not already running
  startPolling(serverId);

  // Send initial data
  await fetchAndBroadcast(serverId);
}

function unsubscribe(ws) {
  if (!ws._serverId) return;

  const serverId = ws._serverId;
  const subs = subscriptions.get(serverId);
  if (subs) {
    subs.delete(ws);
    if (subs.size === 0) {
      subscriptions.delete(serverId);
      stopPolling(serverId);
    }
  }

  ws._serverId = null;
  ws._authed   = false;
}

/* ── Polling ──────────────────────────────────────────────── */

function startPolling(serverId) {
  if (pollTimers.has(serverId)) return;

  const interval = setInterval(function () {
    fetchAndBroadcast(serverId).catch(function () {});
  }, 8000);

  pollTimers.set(serverId, interval);
}

function stopPolling(serverId) {
  const timer = pollTimers.get(serverId);
  if (timer) {
    clearInterval(timer);
    pollTimers.delete(serverId);
  }
}

async function fetchAndBroadcast(serverId) {
  try {
    // Get ERLC key
    const [keyRows] = await pool.query(
      'SELECT erlc_server_key FROM servers WHERE idserver = ?',
      [serverId]
    );
    const encryptedKey = keyRows[0]?.erlc_server_key;
    if (!encryptedKey) return;

    const apiKey = decryptSecret(encryptedKey);
    if (!apiKey) return;

    // Fetch CAD units
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

    // Fetch ERLC players
    const erlcRes = await fetch(`${ERLC_BASE}/v2/server?Players=true`, {
      headers: {
        'server-key': apiKey,
        'Accept': 'application/json',
      },
    });
    if (!erlcRes.ok) return;

    const data = await erlcRes.json();
    const erlcPlayers = (data?.Players || []).map(normalizePlayer);

    // Match CAD units to ERLC players
    const linked = units.map((unit) => {
      const erlcPlayer = erlcPlayers.find(
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

    const payload = {
      type: 'live-units',
      data: {
        players: erlcPlayers,
        units,
        linked,
      },
    };

    // Broadcast to all subscribers for this server
    const subs = subscriptions.get(serverId);
    if (subs) {
      const message = JSON.stringify(payload);
      subs.forEach(function (clientWs) {
        if (clientWs.readyState === 1) {
          try { clientWs.send(message); } catch (_) {}
        }
      });
    }
  } catch (err) {
    logError('[LiveUnits WS]', err.message);
  }
}

/* ── Helpers (mirrored from erlcPoller.js) ────────────────── */

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

function safeSend(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch (_) {}
}

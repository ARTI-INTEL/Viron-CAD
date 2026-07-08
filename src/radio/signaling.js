/**
 * signaling.js  Ultimate CAD – WebRTC Radio Signaling Server
 *
 * Provides a WebSocket-based signaling relay for peer-to-peer voice
 * channels. Uses a mesh topology — every peer connects directly to
 * every other peer in the same room.
 *
 * Rooms are named after the serverId + department channel, e.g.
 *   "1:LEO", "1:FR", "1:DOT", "1:DISPATCH"
 *
 * Auth is verified via a JWT token passed as a query param:
 *   ws://host/?token=<jwt>&serverId=<id>&channel=<channel>
 *
 * Protocol (JSON messages):
 *   Client → Server: { type: "join", channel: "..." }
 *   Server → Client: { type: "peer-list", peers: ["id1", "id2"] }
 *   Client → Server: { type: "offer", target: "peerId", sdp: ... }
 *   Server → Client: { type: "offer", sender: "id", sdp: ... }
 *   Client → Server: { type: "answer", target: "peerId", sdp: ... }
 *   Server → Client: { type: "answer", sender: "id", sdp: ... }
 *   Client → Server: { type: "ice-candidate", target: "peerId", candidate: ... }
 *   Server → Client: { type: "ice-candidate", sender: "id", candidate: ... }
 *   Client → Server: { type: "leave" }
 *   Server → Client: { type: "peer-joined", peerId: "..." }
 *   Server → Client: { type: "peer-left", peerId: "..." }
 *   Server → Client: { type: "channel-active", count: N } — sent to everyone on join/leave
 */

import { WebSocketServer } from 'ws';
import { verifyToken } from '../utility/jwt.js';
import { logInfo, logError } from '../utility/logger.js';

/* ── In-memory room state ────────────────────────────────── */
const rooms = new Map(); // channel → Map<peerId → WebSocket>

let nextPeerId = 1;

/**
 * Attach a WebSocket server to an existing HTTP server.
 * @param {import('http').Server} httpServer
 * @param {string} path - WebSocket endpoint path, e.g. "/radio"
 */
export function attachSignaling(httpServer, path) {
  const wss = new WebSocketServer({ server: httpServer, path: path || '/radio', perMessageDeflate: false });

  wss.on('connection', function (ws, req) {
    /* ── Auth via query params ───────────────────────────── */
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const serverId = url.searchParams.get('serverId');
    const channel = url.searchParams.get('channel');

    // Validate token
    const payload = verifyToken(token || '');
    if (!payload) {
      ws.close(4001, 'Unauthorized: invalid or missing token');
      return;
    }

    if (!serverId || !channel) {
      ws.close(4002, 'Missing serverId or channel');
      return;
    }

    const roomName = serverId + ':' + channel;
    const peerId = 'peer_' + (nextPeerId++);

    ws._peerId = peerId;
    ws._roomName = roomName;
    ws._userId = payload.iduser;

    joinRoom(ws, roomName);

    /* ── Message handler ─────────────────────────────────── */
    ws.on('message', function (data) {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (err) {
        logError(err, 'Radio');
      }
    });

    /* ── Cleanup on disconnect ───────────────────────────── */
    ws.on('close', function () {
      leaveRoom(ws);
    });

    ws.on('error', function () {
      leaveRoom(ws);
    });

  });
}

/* ── Room management ─────────────────────────────────────── */

function joinRoom(ws, roomName) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Map());
  }

  const room = rooms.get(roomName);
  const peerId = ws._peerId;

  // Notify existing peers about the newcomer
  room.forEach(function (peerWs, existingPeerId) {
    if (peerWs.readyState === 1) { // OPEN
      safeSend(peerWs, { type: 'peer-joined', peerId: peerId });
    }
  });

  room.set(peerId, ws);

  // Send the newcomer their peerId and the list of connected peers
  const existingPeers = Array.from(room.keys()).filter(function (id) { return id !== peerId; });
  safeSend(ws, {
    type: 'joined',
    peerId: peerId,
    peers: existingPeers,
  });

  // Broadcast channel activity count
  broadcastRoomActivity(roomName);
}

function leaveRoom(ws) {
  const roomName = ws._roomName;
  const peerId = ws._peerId;
  if (!roomName || !peerId) return;

  const room = rooms.get(roomName);
  if (!room) return;

  room.delete(peerId);

  // Notify remaining peers
  room.forEach(function (peerWs) {
    if (peerWs.readyState === 1) {
      safeSend(peerWs, { type: 'peer-left', peerId: peerId });
    }
  });

  // Clean up empty rooms
  if (room.size === 0) {
    rooms.delete(roomName);
  } else {
    broadcastRoomActivity(roomName);
  }


}

function broadcastRoomActivity(roomName) {
  const room = rooms.get(roomName);
  if (!room) return;

  const count = room.size;
  room.forEach(function (peerWs) {
    if (peerWs.readyState === 1) {
      safeSend(peerWs, { type: 'channel-active', count: count });
    }
  });
}

/* ── Message routing ─────────────────────────────────────── */

function handleMessage(senderWs, msg) {
  const roomName = senderWs._roomName;
  const room = rooms.get(roomName);
  if (!room) return;

  switch (msg.type) {
    case 'offer':
      relayToPeer(room, msg.target, {
        type: 'offer',
        sender: senderWs._peerId,
        sdp: msg.sdp,
      });
      break;

    case 'answer':
      relayToPeer(room, msg.target, {
        type: 'answer',
        sender: senderWs._peerId,
        sdp: msg.sdp,
      });
      break;

    case 'ice-candidate':
      relayToPeer(room, msg.target, {
        type: 'ice-candidate',
        sender: senderWs._peerId,
        candidate: msg.candidate,
      });
      break;

    default:
      break;
  }
}

function relayToPeer(room, targetPeerId, message) {
  const targetWs = room.get(targetPeerId);
  if (targetWs && targetWs.readyState === 1) {
    safeSend(targetWs, message);
  }
}

function safeSend(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch (_) {
    /* ignore send errors */
  }
}

/**
 * Get the number of active peers in a room.
 * Useful for REST endpoint if we want to expose stats.
 */
export function getRoomCount(roomName) {
  const room = rooms.get(roomName);
  return room ? room.size : 0;
}

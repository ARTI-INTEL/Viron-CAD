/**
 * bodycam.routes.js  Viron CAD – Bodycam System API
 *
 * Manages bodycam recording metadata, supervisor requests, and
 * temporary file uploads with 24-hour expiry.
 *
 * Routes mounted at /bodycam
 */

import { Router } from 'express';
import crypto      from 'crypto';
import fs          from 'fs';
import path        from 'path';
import pool        from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';
import { addCallNote } from './call-notes.routes.js';

const router = Router();

const UPLOAD_DIR = path.resolve('uploads', 'bodycam');

// Ensure upload directory exists
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) {}

/* ── Helpers ───────────────────────────────────────────────── */

function generateDownloadToken() {
  return crypto.randomBytes(32).toString('hex');
}

/* ── POST /bodycam/activate – log that bodycam started ──────── */
router.post('/activate', verifyUser, verifyMember, async (req, res) => {
  const { serverId, callId, unitId } = req.body;
  if (!serverId) return res.status(400).json({ error: 'serverId is required' });

  try {
    const [result] = await pool.query(
      `INSERT INTO bodycam_recordings (user_id, server_id, call_id, unit_id, status, started_at)
       VALUES (?, ?, ?, ?, 'new', NOW())`,
      [req.user.iduser, serverId, callId || null, unitId || null]
    );

    const recordingId = result.insertId;

    // Call note if attached to a call
    if (callId) {
      await addCallNote({
        callId,
        serverId,
        type: 'bodycam',
        message: `📹 Bodycam activated by ${req.user.username || 'Unknown'} (recording #${recordingId})`,
        userId: req.user.iduser,
        userName: req.user.username,
      });
    }

    // Set the expected file name on the server side
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName = `bc_${req.user.iduser}_${callId || '0'}_${ts}.webm`;

    await pool.query(
      'UPDATE bodycam_recordings SET file_name = ? WHERE id = ?',
      [fileName, recordingId]
    );

    res.json({ id: recordingId, fileName });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── PATCH /bodycam/:id/deactivate – log that bodycam stopped ─ */
router.patch('/:id/deactivate', verifyUser, async (req, res) => {
  try {
    // Verify ownership
    const [rows] = await pool.query(
      'SELECT id FROM bodycam_recordings WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.iduser]
    );
    if (!rows.length) return res.status(403).json({ error: 'Not your recording' });

    await pool.query(
      'UPDATE bodycam_recordings SET stopped_at = NOW(), status = "new" WHERE id = ?',
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bodycam/recordings – list user's own recordings ───── */
router.get('/recordings', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, call_id, file_name, file_path, status, started_at, stopped_at, requested_by, uploaded_at
       FROM bodycam_recordings
       WHERE user_id = ?
       ORDER BY started_at DESC`,
      [req.user.iduser]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bodycam/recordings/by-call/:callId – supervisor view ── */
router.get('/recordings/by-call/:callId', verifyUser, verifyMember, async (req, res) => {
  try {
    const { serverId } = req.query;
    if (!serverId) return res.status(400).json({ error: 'serverId query param is required' });

    const [rows] = await pool.query(
      `SELECT br.id, br.user_id, br.file_name, br.status, br.started_at, br.uploaded_at,
              u.username AS officer_name
       FROM bodycam_recordings br
       JOIN users u ON u.iduser = br.user_id
       WHERE br.call_id = ? AND br.server_id = ?
       ORDER BY br.started_at DESC`,
      [req.params.callId, serverId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── POST /bodycam/:id/request – supervisor requests bodycam ── */
router.post('/:id/request', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT br.id, br.user_id, br.server_id, br.file_name, u.username
       FROM bodycam_recordings br
       JOIN users u ON u.iduser = br.user_id
       WHERE br.id = ? AND br.status = 'new'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Recording not found or already processed' });

    const rec = rows[0];

    await pool.query(
      'UPDATE bodycam_recordings SET status = "requested", requested_by = ?, requested_at = NOW() WHERE id = ?',
      [req.user.iduser, req.params.id]
    );

    // Also add a call note if linked to a call
    if (rec.call_id) {
      await addCallNote({
        callId: rec.call_id,
        serverId: rec.server_id,
        type: 'bodycam',
        message: `📹 Bodycam #${rec.id} requested by supervisor ${req.user.username || 'Unknown'}`,
        userId: req.user.iduser,
        userName: req.user.username,
      });
    }

    res.json({ success: true, officerName: rec.username });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bodycam/requests/pending – check pending requests on clock-in ── */
router.get('/requests/pending', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT br.id, br.call_id, br.file_name, br.started_at,
              u.username AS requested_by_name
       FROM bodycam_recordings br
       LEFT JOIN users u ON u.iduser = br.requested_by
       WHERE br.user_id = ? AND br.status = 'requested'
       ORDER BY br.requested_at DESC`,
      [req.user.iduser]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── POST /bodycam/:id/upload – officer marks file as uploaded ─ */
router.post('/:id/upload', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id FROM bodycam_recordings WHERE id = ? AND user_id = ? AND status = "requested"',
      [req.params.id, req.user.iduser]
    );
    if (!rows.length) return res.status(404).json({ error: 'Recording not found or not requested' });

    const token = generateDownloadToken();

    await pool.query(
      `UPDATE bodycam_recordings
       SET status = 'uploaded', uploaded_at = NOW(),
           expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR),
           download_token = ?
       WHERE id = ?`,
      [token, req.params.id]
    );

    res.json({ success: true, downloadToken: token });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /bodycam/download/:token – get file info (local only) ── */
router.get('/download/:token', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, file_name, user_id, server_id, started_at
       FROM bodycam_recordings
       WHERE download_token = ? AND status = 'uploaded' AND (expires_at IS NULL OR expires_at > NOW())`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Download link expired or invalid' });

    // Local-only: return metadata so supervisor can coordinate
    const rec = rows[0];
    res.json({
      message: 'File is stored locally by the officer. Coordinate with them to obtain the file.',
      fileName: rec.file_name,
      officerId: rec.user_id,
      recordedAt: rec.started_at,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

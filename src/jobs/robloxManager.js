/**
 * roblox.routes.js  Viron CAD – Roblox OAuth Account Linking
 *
 * Lets users link their Roblox account via Roblox's OAuth 2.0 (PKCE-optional).
 * Stores roblox_id + roblox_username in the users table.
 *
 * Setup (Roblox Creator Dashboard → OAuth 2.0 Apps):
 *   https://create.roblox.com/dashboard/credentials
 *
 * Required scopes:  openid  profile
 *
 * ENV variables required:
 *   ROBLOX_CLIENT_ID
 *   ROBLOX_CLIENT_SECRET
 *   ROBLOX_REDIRECT_URI   (optional – auto-built from request host if absent)
 *
 * Routes mounted at /auth/roblox:
 *   GET  /auth/roblox/link       – start OAuth (requires logged-in session via x-user-id query param)
 *   GET  /auth/roblox/callback   – OAuth callback
 *   DELETE /auth/roblox/unlink   – remove linked Roblox account
 *   GET  /auth/roblox/me         – return current user's linked Roblox info
 */

import { Router } from 'express';
import pool from '../db.js';
import { verifyUser } from '../middleware/auth.middleware.js';
import { verifyToken } from '../utility/jwt.js';
import { configDotenv } from 'dotenv';
import { logError } from '../utility/logger.js';

configDotenv();

const router = Router();

const ROBLOX_AUTH   = 'https://apis.roblox.com/oauth/v1/authorize';
const ROBLOX_TOKEN  = 'https://apis.roblox.com/oauth/v1/token';
const ROBLOX_ME     = 'https://apis.roblox.com/oauth/v1/userinfo';

// In-memory state store: state → { userId, expiresAt }
// In production swap this for Redis or a DB table.
const stateStore = new Map();

function buildRedirectUri(req) {
  if (process.env.ROBLOX_REDIRECT_URI) return process.env.ROBLOX_REDIRECT_URI;
  return `${req.protocol}://${req.get('host')}/auth/roblox/callback`;
}

function ensureRobloxConfig(res) {
  if (!process.env.ROBLOX_CLIENT_ID || !process.env.ROBLOX_CLIENT_SECRET) {
    res.status(500).json({
      error: 'Roblox OAuth is not configured. Set ROBLOX_CLIENT_ID and ROBLOX_CLIENT_SECRET in .env',
    });
    return false;
  }
  return true;
}

// Purge expired state entries
function cleanStates() {
  const now = Date.now();
  for (const [k, v] of stateStore) {
    if (v.expiresAt < now) stateStore.delete(k);
  }
}

/* ── GET /auth/roblox/link ────────────────────────────────── */
// Called from the frontend as a page redirect:
//   window.location.href = '/auth/roblox/link?token=<jwt>'
// We verify the JWT to get the userId rather than trusting a raw
// userId query param (previous vulnerability).
router.get('/link', (req, res) => {
  if (!ensureRobloxConfig(res)) return;

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token query param required' });

  const payload = verifyToken(token);
  if (!payload || !payload.iduser) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  cleanStates();

  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  stateStore.set(state, { userId: payload.iduser, expiresAt: Date.now() + 10 * 60 * 1000 });

  const params = new URLSearchParams({
    client_id:     process.env.ROBLOX_CLIENT_ID,
    redirect_uri:  buildRedirectUri(req),
    scope:         'openid profile',
    response_type: 'code',
    state,
  });

  res.redirect(`${ROBLOX_AUTH}?${params.toString()}`);
});

/* ── GET /auth/roblox/callback ────────────────────────────── */
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error)
    return res.redirect('/account?roblox_error=denied');

  if (!code || !state)
    return res.redirect('/account?roblox_error=missing_params');

  cleanStates();
  const stored = stateStore.get(state);

  if (!stored || stored.expiresAt < Date.now()) {
    stateStore.delete(state);
    return res.redirect('/account?roblox_error=invalid_state');
  }

  stateStore.delete(state);
  const { userId } = stored;

  try {
    // ── Exchange code for tokens ───────────────────────────
    const tokenRes = await fetch(ROBLOX_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.ROBLOX_CLIENT_ID,
        client_secret: process.env.ROBLOX_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code:          String(code),
        redirect_uri:  buildRedirectUri(req),
      }),
    });

    if (!tokenRes.ok) {
      logError('[Roblox OAuth] Token exchange failed:', await tokenRes.text());
      return res.redirect('/account?roblox_error=token_failed');
    }

    const { access_token } = await tokenRes.json();

    // ── Fetch Roblox user info ─────────────────────────────
    const meRes = await fetch(ROBLOX_ME, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!meRes.ok) {
      logError('[Roblox OAuth] Userinfo failed:', await meRes.text());
      return res.redirect('/account?roblox_error=userinfo_failed');
    }

    const robloxUser = await meRes.json();
    // robloxUser.sub                = Roblox user ID (string)
    // robloxUser.preferred_username = Roblox @username
    // robloxUser.nickname           = display name

    const robloxId       = robloxUser.sub;
    const robloxUsername = robloxUser.preferred_username || robloxUser.nickname || robloxUser.name;

    // ── Check if this Roblox account is already linked to another CAD user ──
    const [existing] = await pool.query(
      'SELECT iduser FROM users WHERE roblox_id = ? AND iduser <> ?',
      [robloxId, userId]
    );
    if (existing.length > 0) {
      return res.redirect('/account?roblox_error=already_linked');
    }

    // ── Update DB ──────────────────────────────────────────
    await pool.query(
      'UPDATE users SET roblox_id = ?, roblox_username = ? WHERE iduser = ?',
      [robloxId, robloxUsername, userId]
    );

    return res.redirect(`/account?roblox_success=1&roblox_username=${encodeURIComponent(robloxUsername)}`);
  } catch (err) {
    logError('[Roblox OAuth] Unexpected error:', err);
    return res.redirect('/account?roblox_error=server_error');
  }
});

/* ── DELETE /auth/roblox/unlink ───────────────────────────── */
router.delete('/unlink', verifyUser, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET roblox_id = NULL, roblox_username = NULL WHERE iduser = ?',
      [req.user.iduser]
    );
    res.json({ success: true });
  } catch (err) {
    logError('[Roblox OAuth] Unexpected error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /auth/roblox/me ──────────────────────────────────── */
router.get('/me', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT roblox_id, roblox_username FROM users WHERE iduser = ?',
      [req.user.iduser]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    logError('[Roblox OAuth] Unexpected error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
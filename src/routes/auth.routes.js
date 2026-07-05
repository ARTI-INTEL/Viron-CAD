import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { configDotenv } from 'dotenv';
import { verifyUser } from '../middleware/auth.middleware.js';
import { signToken } from '../utility/jwt.js';
import { logError } from '../utility/logger.js';

configDotenv();

const router = Router();

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const discordTokenStore = new Map();

function buildRedirectUri(req) {
  if (process.env.DISCORD_REDIRECT_URI) return process.env.DISCORD_REDIRECT_URI;
  return `${req.protocol}://${req.get('host')}/auth/discord/callback`;
}

function ensureDiscordConfig(res, req) {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    res.status(500).json({
      error: 'Discord OAuth is not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.',
    });
    return false;
  }
  return true;
}

router.get('/discord/login', (req, res) => {
  if (!ensureDiscordConfig(res, req)) return;

  const redirectUri = buildRedirectUri(req);
  const scope = encodeURIComponent('identify guilds email');
  const clientId = encodeURIComponent(process.env.DISCORD_CLIENT_ID);
  const encodedRedirectUri = encodeURIComponent(redirectUri);

  const authorizeUrl =
    `https://discord.com/oauth2/authorize?client_id=${clientId}` +
    `&response_type=code&redirect_uri=${encodedRedirectUri}&scope=${scope}`;

  res.redirect(authorizeUrl);
});

router.get('/discord/callback', async (req, res) => {
  if (!ensureDiscordConfig(res, req)) return;

  const { code, error } = req.query;

  if (error) {
    return res.redirect('/?auth_error=discord_authorization_denied');
  }

  if (!code) {
    return res.redirect('/?auth_error=missing_authorization_code');
  }

  const redirectUri = buildRedirectUri(req);

  try {
    const tokenResponse = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      return res.redirect('/?auth_error=discord_token_exchange_failed');
    }

    const tokenPayload = await tokenResponse.json();

    const userResponse = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });

    if (!userResponse.ok) {
      return res.redirect('/?auth_error=discord_profile_fetch_failed');
    }

    const discordUser = await userResponse.json();
    const discordId   = discordUser.id;
    const username    = discordUser.global_name || discordUser.username;
    // ── NEW: capture email from Discord ──────────────────────────
    const email       = discordUser.email || null;

    discordTokenStore.set(discordId, {
      accessToken:  tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token || null,
      expiresAt:    Date.now() + ((Number(tokenPayload.expires_in) || 0) * 1000),
    });

    const [existingRows] = await pool.query('SELECT * FROM users WHERE discord_id = ?', [discordId]);

    let userRecord = existingRows[0];

    if (!userRecord) {
      // ── NEW: store email on first join ────────────────────────
      const [result] = await pool.query(
        'INSERT INTO users (discord_id, username, email) VALUES (?, ?, ?)',
        [discordId, username, email]
      );
      const [newRows] = await pool.query('SELECT * FROM users WHERE iduser = ?', [result.insertId]);
      userRecord = newRows[0];
    } else {
      // Update username if it changed; fill in email if previously missing
      const updates = [];
      const values  = [];

      if (userRecord.username !== username) {
        updates.push('username = ?');
        values.push(username);
        userRecord.username = username;
      }

      if (email && !userRecord.email) {
        updates.push('email = ?');
        values.push(email);
        userRecord.email = email;
      }

      if (updates.length) {
        values.push(userRecord.iduser);
        await pool.query(
          `UPDATE users SET ${updates.join(', ')} WHERE iduser = ?`,
          values
        );
      }
    }

    // ── Issue a signed JWT for session auth ────────────────
    const token = signToken(userRecord.iduser);

    // Store session record
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    try {
      var clientIp = req.ip || (req.connection ? req.connection.remoteAddress : null) || null;
      await pool.query(
        'INSERT INTO user_sessions (user_id, token_hash, user_agent, ip_address) VALUES (?, ?, ?, ?)',
        [userRecord.iduser, tokenHash, req.headers['user-agent'] || null, clientIp]
      );
    } catch (_) { /* session logging is best-effort */ }

    const params = new URLSearchParams({
      auth_success: '1',
      token:        token,
      iduser:       String(userRecord.iduser),
      username:     userRecord.username,
      discord_id:   userRecord.discord_id,
      created_at:   userRecord.created_at ? String(userRecord.created_at) : '',
    });

    return res.redirect(`/?${params.toString()}`);
  } catch (err) {
    logError(err);
    return res.redirect('/?auth_error=discord_oauth_failed');
  }
});

/* ── GET /auth/sessions  list active sessions for current user ── */
router.get('/sessions', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, user_id, user_agent, ip_address, created_at, last_used_at, revoked
       FROM user_sessions
       WHERE user_id = ?
       ORDER BY last_used_at DESC`,
      [req.user.iduser]
    );

    // Hash the current request's token to identify this session
    const authHeader = req.headers['authorization'];
    let currentTokenHash = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      currentTokenHash = crypto.createHash('sha256').update(authHeader.slice(7)).digest('hex');
    }

    res.json(rows.map(function (s) {
      return {
        id: s.id,
        userAgent: s.user_agent,
        ipAddress: s.ip_address,
        createdAt: s.created_at,
        lastUsedAt: s.last_used_at,
        revoked: !!s.revoked,
        isCurrent: s.token_hash === currentTokenHash,
      };
    }));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── DELETE /auth/sessions  revoke all sessions except current ── */
router.delete('/sessions', verifyUser, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    let currentTokenHash = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      currentTokenHash = crypto.createHash('sha256').update(authHeader.slice(7)).digest('hex');
    }

    if (currentTokenHash) {
      await pool.query(
        'UPDATE user_sessions SET revoked = 1 WHERE user_id = ? AND token_hash != ? AND revoked = 0',
        [req.user.iduser, currentTokenHash]
      );
    } else {
      await pool.query(
        'UPDATE user_sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0',
        [req.user.iduser]
      );
    }

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── DELETE /auth/sessions/:id  revoke a specific session ── */
router.delete('/sessions/:id', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id FROM user_sessions WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.iduser]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });

    await pool.query('UPDATE user_sessions SET revoked = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/discord/owner-guilds', verifyUser, async (req, res) => {
  const discordId   = req.user.discord_id;
  const tokenRecord = discordTokenStore.get(discordId);

  if (!discordId || !tokenRecord?.accessToken) {
    return res.status(401).json({
      error: 'Discord guild access is unavailable. Please sign in with Discord again.',
    });
  }

  try {
    const guildsResponse = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${tokenRecord.accessToken}` },
    });

    if (!guildsResponse.ok) {
      if (guildsResponse.status === 401 || guildsResponse.status === 403) {
        discordTokenStore.delete(discordId);
        return res.status(401).json({
          error: 'Discord guild access expired. Please sign in with Discord again.',
        });
      }
      throw new Error(`Discord guild fetch failed with status ${guildsResponse.status}`);
    }

    const guilds      = await guildsResponse.json();
    const ownerGuilds = guilds
      .filter((g) => g.owner)
      .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));

    res.json(ownerGuilds);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Failed to load Discord servers' });
  }
});

export default router;
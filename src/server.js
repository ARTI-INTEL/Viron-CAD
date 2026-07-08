import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import auditRoutes        from './routes/audit.routes.js';
import authRoutes         from './routes/auth.routes.js';
import robloxRoutes       from './jobs/robloxManager.js';
import userRoutes         from './routes/users.routes.js';
import serverRoutes       from './routes/servers.routes.js';
import unitRoutes         from './routes/units.routes.js';
import callRoutes         from './routes/calls.routes.js';
import boloRoutes         from './routes/bolos.routes.js';
import reportRoutes       from './routes/reports.routes.js';
import searchRoutes       from './routes/search.routes.js';
import characterRoutes    from './routes/characters.routes.js';
import vehicleRoutes      from './routes/vehicles.routes.js';
import firearmRoutes      from './routes/firearms.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import departmentRoutes     from './routes/departments.routes.js';
import deptMembersRoutes     from './routes/dept-members.routes.js';
import deptRanksRoutes       from './routes/dept-ranks.routes.js';
import deptDocsRoutes        from './routes/dept-docs.routes.js';
import deptInfractionRoutes from './routes/dept-infractions.routes.js';
import deptVehicleRoutes     from './routes/dept-vehicles.routes.js';
import deptActivityRoutes    from './routes/dept-activity.routes.js';
import erlcRoutes         from './jobs/erlcPoller.js';
import tempCharRoutes     from './routes/temp-characters.routes.js';
import callNotesRoutes     from './routes/call-notes.routes.js';
import bodycamRoutes       from './routes/bodycam.routes.js';
import { attachSignaling } from './radio/signaling.js';
import {logInfo,logError,requestLogger} from './utility/logger.js';
import { assertEncryptionConfigured } from './utility/crypto.js';
import { assertJwtConfigured } from './utility/jwt.js';
import { assertDbSslConfigured } from './db.js';
import pool from './db.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Trust proxy (Render / cloud deployments) ───────────────
   Ensures req.protocol reads 'https' and req.ip reads the real
   client IP when behind a reverse proxy.                      */
app.set('trust proxy', 1);

/* =========================
   SECURITY MIDDLEWARE
========================= */

// Helmet with explicit CSP to avoid blocking external assets
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(function (s) { return s.trim(); })
  : (process.env.CLIENT_URL || 'http://localhost:5500');

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://pagead2.googlesyndication.com', 'https://fonts.googleapis.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'https:', 'data:'],
      connectSrc: ["'self'", 'https://discord.com', 'ws:', 'wss:'],
      frameSrc: ["'self'"],
    },
  },
}));

/* =========================
   CORE MIDDLEWARE
========================= */

app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

/* ── Clean URL routes (hide .html extensions) ─────────────── */
app.get('/dashboard',      (req, res) => res.sendFile('dashboard.html',      { root: 'public' }));
app.get('/server',         (req, res) => res.sendFile('server-page.html',     { root: 'public' }));
app.get('/settings',       (req, res) => res.sendFile('server-settings.html', { root: 'public' }));
app.get('/account',        (req, res) => res.sendFile('settings.html',        { root: 'public' }));
app.get('/leo',            (req, res) => res.sendFile('leo-cad.html',         { root: 'public' }));
app.get('/fr',             (req, res) => res.sendFile('fr-cad.html',          { root: 'public' }));
app.get('/dot',            (req, res) => res.sendFile('dot-cad.html',         { root: 'public' }));
app.get('/dispatcher',     (req, res) => res.sendFile('dispatcher-cad.html',  { root: 'public' }));
app.get('/civilian',       (req, res) => res.sendFile('civilian.html',        { root: 'public' }));
app.get('/dept-manage',    (req, res) => res.sendFile('dept-manage.html',     { root: 'public' }));

/* =========================
   ROUTES
========================= */

app.use('/auth',          authRoutes);
app.use('/auth/roblox',   robloxRoutes);
app.use('/users',         userRoutes);
app.use('/servers',       serverRoutes);
app.use('/units',         unitRoutes);
app.use('/calls',         callRoutes);
app.use('/bolos',         boloRoutes);
app.use('/reports',       reportRoutes);
app.use('/search',        searchRoutes);
app.use('/characters',    characterRoutes);
app.use('/vehicles',      vehicleRoutes);
app.use('/firearms',      firearmRoutes);
app.use('/verification',  verificationRoutes);
app.use('/departments',     departmentRoutes);
app.use('/dept-members',   deptMembersRoutes);
app.use('/dept-ranks',     deptRanksRoutes);
app.use('/dept-docs',      deptDocsRoutes);
app.use('/dept-infractions', deptInfractionRoutes);
app.use('/dept-activity',    deptActivityRoutes);
app.use('/dept-vehicles',    deptVehicleRoutes);
app.use('/audit',        auditRoutes);
app.use('/erlc',          erlcRoutes);
app.use('/temp-chars',    tempCharRoutes);
app.use('/call-notes',    callNotesRoutes);
app.use('/bodycam',        bodycamRoutes);

/* ── 404 catch-all: serve custom page for unmatched routes ── */
app.use((req, res) => {
  // Only catch HTML document requests — let API routes return JSON 404s
  if (req.accepts('html')) {
    res.status(404).sendFile('404.html', { root: 'public' });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

/* ═══════════════════════════════════════════════════════════════
   BODYCAM CLEANUP — purge expired downloads every hour
═══════════════════════════════════════════════════════════════ */
function startBodycamCleanup() {
  var interval = 60 * 60 * 1000; // every hour
  setInterval(async function () {
    try {
      const [result] = await pool.query(
        `DELETE FROM bodycam_recordings WHERE status = 'uploaded' AND expires_at IS NOT NULL AND expires_at < NOW()`
      );
      if (result.affectedRows > 0) {
        logInfo('Bodycam cleanup: removed ' + result.affectedRows + ' expired recordings', 'Housekeeping');
      }
    } catch (err) {
      logError(err, 'BodycamCleanup');
    }
  }, interval);
}

/* =========================
   BOOT-TIME SECURITY CHECKS
========================= */
assertEncryptionConfigured();
assertJwtConfigured();
assertDbSslConfigured();
startBodycamCleanup();

/* =========================
   START SERVER
========================= */

/* =========================
   GLOBAL ERROR HANDLER
   Catches anything that escapes route handlers so we always
   return a meaningful response instead of the default 500 HTML.
========================= */
app.use(function (err, req, res, _next) {
  logError(err, 'Express');
  logInfo(req.method + ' ' + (req.originalUrl || req.url) + ' — 500', 'Express');

  // OAuth callback → redirect so the user sees the landing page with an error
  var url = req.originalUrl || req.url;
  if (url.indexOf('/auth/discord/callback') !== -1) {
    return res.redirect('/?auth_error=internal_error');
  }

  res.status(500).json({
    error: 'Internal server error',
    detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});

const server = http.createServer(app);

/* ── WebRTC Radio Signaling ───────────────────────────────── */
attachSignaling(server, '/radio');



/* ── Start listening ──────────────────────────────────────── */
server.listen(PORT, () => {
  logInfo(`Ultimate CAD server running on http://localhost:${PORT}`);
});
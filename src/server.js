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
import deptActivityRoutes    from './routes/dept-activity.routes.js';
import erlcRoutes         from './jobs/erlcPoller.js';
import {logInfo,logError,requestLogger} from './utility/logger.js';
import { assertEncryptionConfigured } from './utility/crypto.js';
import { assertJwtConfigured } from './utility/jwt.js';
import { assertDbSslConfigured } from './db.js';

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
      connectSrc: ["'self'", 'https://discord.com'],
      frameSrc: ["'self'"],
    },
  },
}));

/* =========================
   CORE MIDDLEWARE
========================= */

app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

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
app.use('/audit',        auditRoutes);
app.use('/erlc',          erlcRoutes);

/* =========================
   BOOT-TIME SECURITY CHECKS
========================= */
assertEncryptionConfigured();
assertJwtConfigured();
assertDbSslConfigured();

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
    return res.redirect('/index.html?auth_error=internal_error');
  }

  res.status(500).json({
    error: 'Internal server error',
    detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});

app.listen(PORT, () => {
  logInfo(`Ultimate CAD server running on http://localhost:${PORT}`);
});
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

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

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

/* =========================
   SECURITY MIDDLEWARE
========================= */

// Helmet (sets secure HTTP headers)
app.use(helmet());

// CORS (restrict origins in production)
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5500',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

/* =========================
   CORE MIDDLEWARE
========================= */

app.use(express.json());
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
app.use('/erlc',          erlcRoutes);

/* =========================
   BOOT-TIME SECURITY CHECKS
========================= */
assertEncryptionConfigured();

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  logInfo(`Ultimate CAD server running on http://localhost:${PORT}`);
});
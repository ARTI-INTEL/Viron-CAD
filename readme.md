# Ultimate CAD

A modern, web-based Computer-Aided Dispatch (CAD) system for Roblox roleplay communities, built with **Node.js**, **Express**, and **MySQL**. Features real-time ERLC (Emergency Response: Liberty County) integration, Discord OAuth authentication, WebRTC voice radio, bodycam recording, and a full-featured dispatch interface.

---

## Features

### 🚔 Dispatch System
- **Active Calls** — Create, update, and close calls with priority levels (Low, Medium, High, Critical)
- **Call Notes** — Auto-generated audit trail when calls are updated, units attached, or bodycams activated
- **Unit Management** — Clock in/out, update status (Available, Unavailable, On Scene, Enroute, Busy)
- **Role-Based CAD Views** — Dedicated interfaces for LEO, Fire & Rescue, DOT, Dispatchers, and Civilians
- **In-Game Map** — Interactive CAD map with draggable markers and zoom support
- **Clean URL Routes** — Access pages via `/dashboard`, `/server`, `/account`, `/leo`, `/fr`, `/dot`, `/dispatcher`, `/civilian`, `/dept-manage`

### 🎮 ERLC Integration
- **Live Player Tracking** — View in-game players matched to CAD units by Roblox username (WebSocket-powered)
- **Emergency Calls Sync** — Import/sync active 911 calls from your ERLC server into the CAD with deduplication
- **Server Status & Logs** — Query join logs, kill logs, command logs, queue, staff list, and vehicle lists
- **Moderation Actions** — Ban/unban players and execute server commands directly from the CAD
- **Encrypted Key Storage** — ERLC server keys are AES-256-GCM encrypted at rest
- **Player Position Feed** — Dedicated endpoint for live-position polling consumed by the CADMap module

### 🏢 Department Management
- **Custom Departments** — Create LEO, FR, and DOT departments per server
- **Rank System** — Define custom rank hierarchies with granular permissions per department
- **Member Tracking** — Assign members to departments with role-based access control
- **Activity Logging** — Track clock-in times and generate activity reports
- **Department Vehicles** — Register and assign fleet vehicles to units, track color/plate/model
- **Department Documents** — Upload and manage SOPs, policies, and reference docs
- **Infraction System** — Issue and track department-level infractions

### 📹 Bodycam System
- **Desktop Recording** — Electron app captures Roblox game window via desktop capture API
- **Keybind Toggle** — Assign a global hotkey (default F2) to start/stop bodycam recording
- **Call-Linked** — Recording metadata is linked to the active call; file names include user ID & call ID
- **Supervisor Request Flow** — Supervisors request bodycam footage from officers; officers get notified on clock-in
- **24-Hour Expiry** — Uploaded recordings expire after 24 hours and are auto-purged from the database
- **Call Notes Integration** — Bodycam activation/deactivation and requests are logged in call notes

### 🎙️ WebRTC Radio / Voice Communication
- **Real-Time Voice** — Peer-to-peer voice channels using WebRTC with WebSocket signaling
- **Per-Department Channels** — Separate rooms for LEO, FR, DOT, and Dispatch
- **JWT-Authenticated** — WebSocket connections verified via query-param JWT tokens
- **Mesh Topology** — Every peer connects directly to every other peer in the same channel

### 📄 Report System & PDF Templates
- **Incident Reports** — LEO incident reports, citations, written warnings, arrest reports, warrants
- **F&R Reports** — Medical reports, death reports, fire incident reports
- **DOT Reports** — DOT incident reports and tow reports
- **PDF Template Rendering** — Pre-designed PDF templates with `pdf-lib` field injection
- **Field-Level Configuration** — Adjustable x/y coordinates, font size, color, and max-width per field

### 🔗 Discord Webhook Integration
- **Template-Driven Embeds** — JSON-defined embed templates with `{{placeholder}}` syntax
- **Audit Log Webhooks** — Real-time alerts for kicks, calls, reports, infractions, and stolen-marker events
- **Clock-In/Out Webhooks** — Department notification when units go on-duty
- **BOLO Alerts** — Auto-posted alerts for Be On the LookOut entries
- **Report-Filed Webhooks** — Notifications when reports are submitted

### 👥 User & Server Management
- **Discord OAuth Login** — Sign in securely with your Discord account
- **Roblox Account Linking** — Link Roblox accounts via OAuth 2.0 for automatic unit-to-player matching
- **Server Memberships** — Join servers via unique join codes
- **Role Management** — Owner, Admin, Moderator, and Member roles per server
- **Session Security** — View and revoke active sessions from the settings page
- **Email Verification** — 6-digit verification codes for destructive actions (delete server, delete account)
- **Desktop App** — Standalone Electron desktop app with auto-updater support

### 🎭 Temp Character System
- **Auto-Creation** — Automatically create temporary characters with randomized names, licenses, plates, and vehicles when players join the ERLC server
- **Auto-Removal** — Temp characters are cleaned up when players leave the server
- **Toggle-able** — Per-server toggle (`auto_temp_chars`) to enable/disable the feature
- **Sync Endpoint** — Manual or poller-triggered sync compares ERLC player list vs existing temp chars

### 🔍 Search & Records
- **Character Records** — Full character profiles with flags and identifiers
- **Vehicle Registration** — Track vehicles by plate, VIN, model, and insurance status
- **Firearm Registration** — Serialized firearm registry with stolen status tracking
- **BOLOs** — Be On the LookOut for vehicles, persons, and property
- **Reports** — Generate and manage incident reports with detailed logging
- **Cross-Entity Search** — Unified search across characters, vehicles, and firearms

### 🛡️ Audit Log
- **Granular Event Tracking** — Logs member kicks, call creation/closure, report edits, infractions, stolen-marker changes
- **Server-Level Scope** — Each server has its own independent audit log

---

## Tech Stack

| Layer             | Technology                              |
|-------------------|-----------------------------------------|
| **Backend**       | Node.js, Express 5                      |
| **Database**      | MySQL 8 with mysql2/promise              |
| **Real-Time**     | ws (WebSocket), WebRTC                   |
| **Auth**          | Discord OAuth 2, Roblox OAuth 2, JWT (HS256) |
| **Encryption**    | AES-256-GCM (ERLC server keys)          |
| **PDF Generation**| pdf-lib, pdfkit                          |
| **Email**         | Nodemailer (SMTP)                        |
| **Security**      | Helmet, CORS, Rate Limiting             |
| **Frontend**      | Vanilla JS, CSS (no framework)           |
| **Desktop App**   | Electron, electron-builder, electron-updater |
| **Fonts**         | Inter (Google Fonts)                     |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [MySQL](https://dev.mysql.com/downloads/) 8.0+
- A [Discord Application](https://discord.com/developers/applications) for OAuth
- (Optional) An ERLC server key for game integration
- (Optional) An SMTP server for email verification codes
- (Optional) A [Roblox OAuth 2 App](https://create.roblox.com/dashboard/credentials) for account linking

### 1. Clone & Install

```bash
git clone https://github.com/ARTI-INTEL/Ultimate-CAD.git
cd Ultimate-CAD
npm install
```

### 2. Database Setup

Create a MySQL database and import the schema:

```bash
mysql -u root -p < config/database.sql
```

This creates the `ultimate_cad` database with all required tables.

### 3. Environment Variables

Create a `.env` file in the project root:

```env
# ── Database ──────────────────────────────────────────
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_db_password
DB_NAME=ultimate_cad

# ── Discord OAuth ─────────────────────────────────────
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
# Optional: override the redirect URI (auto-detected by default)
# DISCORD_REDIRECT_URI=https://yourdomain.com/auth/discord/callback

# ── JWT Session ───────────────────────────────────────
JWT_SECRET=generate_a_long_random_string_here
JWT_EXPIRES_IN=7d

# ── ERLC Key Encryption ───────────────────────────────
ERLC_ENCRYPTION_KEY=generate_a_64_char_hex_string_here

# ── SMTP (Email Verification) ─────────────────────────
# Optional — codes are logged to console in dev
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
SMTP_FROM="Ultimate CAD <noreply@yourdomain.com>"

# ── Roblox OAuth (Optional) ──────────────────────────
ROBLOX_CLIENT_ID=your_roblox_client_id
ROBLOX_CLIENT_SECRET=your_roblox_client_secret
# Optional: override the redirect URI (auto-detected by default)
# ROBLOX_REDIRECT_URI=https://yourdomain.com/auth/roblox/callback

# ── Server ────────────────────────────────────────────
PORT=5500
NODE_ENV=development
CLIENT_URL=http://localhost:5500
# Comma-separated if multiple origins:
# ALLOWED_ORIGINS=http://localhost:5500,https://yourdomain.com
```

Generate the required secrets:

```bash
# Generate a 32-byte hex key for ERLC_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate a JWT_SECRET (any long random string)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Start the Server

```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:5500` by default. Open this URL in your browser to access the CAD.

---

## Discord OAuth Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Navigate to **OAuth2 → General**
4. Add a redirect URL: `https://yourdomain.com/auth/discord/callback` (or `http://localhost:5500/auth/discord/callback` for local dev)
5. Copy the **Client ID** and **Client Secret** into your `.env` file
6. The OAuth2 scope used is `identify guilds email`

---

## Roblox OAuth Setup (Optional)

1. Go to the [Roblox Creator Dashboard → OAuth 2.0 Apps](https://create.roblox.com/dashboard/credentials)
2. Create a new OAuth 2.0 application
3. Add a redirect URL: `https://yourdomain.com/auth/roblox/callback` (or `http://localhost:5500/auth/roblox/callback` for local dev)
4. Request scopes: `openid profile`
5. Copy the **Client ID** and **Client Secret** into your `.env` file
6. Users can link their Roblox accounts from the Account Settings page for automatic unit-to-player matching

---

## Desktop App (Optional)

The `electron/` directory contains a standalone Electron desktop app that wraps the CAD web interface with:
- **Bodycam Recording** — Captures the Roblox game window via desktop capture API
- **Global Keybinds** — Start/stop bodycam with a configurable hotkey (default F2)
- **Auto-Updater** — Checks GitHub releases for updates on launch

To run the desktop app:

```bash
cd electron
npm install
npm start
```

To build installers:

```bash
cd electron
npm run build
```

---

## Discord Bot (Optional)

The `discord-bot/` directory contains a standalone Discord bot that adds slash commands and role-syncing to your CAD server. It runs as a **separate Node process** (not bolted onto `server.js`) because discord.js's Gateway connection is long-lived and stateful — keeping it separate avoids crashes during `npm run dev`'s file-watching restarts.

### 🤖 Architecture

```
┌─────────────────┐       x-bot-secret        ┌──────────────────┐
│  Discord Bot     │ ────────────────────────► │  CAD Server API   │
│  (discord-bot/)  │   GET /bot-api/*          │  (src/server.js)  │
│                  │◄──────────────────────── │                  │
│  • Slash commands│        JSON response      │  • verifyBotSecret│
│  • Role sync     │                           │  • MySQL queries  │
└─────────────────┘                           └──────────────────┘
        │                                              │
        │  Discord Gateway                              │  Express HTTP
        ▼                                              ▼
┌─────────────────┐                           ┌──────────────────┐
│  Discord Servers │                           │  MySQL Database  │
└─────────────────┘                           └──────────────────┘
```

**Key design decisions:**

- **Separate process** — The bot runs independently from your Express app. No `discord.js` dependency in the main CAD server.
- **No direct DB access** — The bot calls REST endpoints at `/bot-api/*`, protected by a shared secret (`x-bot-secret` header). This keeps all business logic (permission checks, JSON parsing) in one place.
- **Reuses Discord OAuth link** — Since `discord_id` is already stored on the `users` table during login, the `/link` command confirms what's already there — no separate linking table needed.

### 📋 Slash Commands

| Command              | Description                                           | Visibility      |
|----------------------|-------------------------------------------------------|-----------------|
| `/link`              | Check if your Discord account is linked to a CAD user | Ephemeral (you only) |
| `/units`             | Show all currently active (clocked-in) CAD units      | Public          |
| `/dept-role-sync`    | Preview department members and their ranks            | Ephemeral (you only) |

### 🔧 Setup

#### 1. Install bot dependencies

```bash
cd discord-bot
npm install
```

#### 2. Configure environment

Create `discord-bot/.env`:

```env
# ── Discord Bot Token ──────────────────────────────────────────
# Get this from https://discord.com/developers/applications → Bot → Reset Token
DISCORD_BOT_TOKEN=your_bot_token_here

# ── Discord Application ID ─────────────────────────────────────
# Reuse the same app from your OAuth login (same as DISCORD_CLIENT_ID)
DISCORD_CLIENT_ID=your_discord_client_id

# ── Guild ID (optional, for instant command registration) ──────
# Set during development so slash commands register instantly.
# Remove for production to register commands globally.
DISCORD_GUILD_ID=your_dev_guild_id

# ── CAD API Base URL ──────────────────────────────────────────
# The public URL (or localhost) where your CAD server runs
CAD_API_BASE=http://localhost:5500

# ── Shared Secret ──────────────────────────────────────────────
# MUST match DISCORD_BOT_SECRET in the main CAD server's .env
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
DISCORD_BOT_SECRET=generate_a_64_char_hex_string_here
```

#### 3. Add the shared secret to your main CAD server

Add the **same** `DISCORD_BOT_SECRET` value to your root `.env`:

```env
# ── Discord Bot (shared secret) ────────────────────────────────
# Must match discord-bot/.env exactly
DISCORD_BOT_SECRET=your_generated_secret_here
```

#### 4. Register slash commands & invite the bot

Run the deploy script — it registers the commands with Discord AND prints the correct invite URL:

```bash
cd discord-bot
npm run deploy-commands
```

The script will output an invite URL. Click it, select your server, and authorize. Your bot needs **both** OAuth2 scopes for slash commands to work:

- `bot` — lets the bot be in your server
- `applications.commands` — lets the bot register slash commands

The invite URL printed by the script already includes both scopes.

#### 5. Start the bot

```bash
cd discord-bot
npm start
```

### 🚀 Deployment

The bot runs as a **second process** alongside your main CAD server:

**Local development:**
```bash
# Terminal 1 — main CAD server
npm run dev

# Terminal 2 — Discord bot
cd discord-bot && npm start
```

**Production (PM2):**
```bash
# Install PM2 globally
npm install -g pm2

# Start both processes
pm2 start src/server.js --name ultimate-cad
pm2 start discord-bot/index.js --name ultimate-cad-bot

# Save process list for auto-restart on reboot
pm2 save
pm2 startup
```

**Production (Render / Railway):**
- Deploy the main CAD server as a web service
- Deploy `discord-bot/` as a separate worker service
- Point `CAD_API_BASE` at the web service's public URL

### 🔌 API Endpoints (Bot-Only)

These endpoints are consumed by the bot. They are **not** accessible with a user JWT — they require the `x-bot-secret` header.

| Method | Endpoint                                | Description                                  |
|--------|-----------------------------------------|----------------------------------------------|
| GET    | `/bot-api/link-status/:discordId`       | Check if a Discord user is linked to CAD     |
| GET    | `/bot-api/units/:discordGuildId`        | Get active units for a CAD-linked Discord guild |
| GET    | `/bot-api/dept-role-sync/:discordGuildId` | Get members + ranks for role mapping       |

### 🛡️ Security

- **Shared secret** — The `x-bot-secret` header is verified by `bot.middleware.js` against `DISCORD_BOT_SECRET` in the main CAD `.env`.
- **No user data leak** — Bot endpoints only expose what's necessary and never return encrypted keys or passwords.
- **Ephemeral responses** — `/link` and `/dept-role-sync` replies are visible only to the user who ran the command.

---

## Project Structure

```
ultimate-cad/
├── config/
│   └── database.sql            # MySQL schema dump
├── electron/                   # Standalone Electron desktop app
│   ├── main.js                 # Electron main process (window, IPC, keybind, auto-update)
│   ├── preload.js              # Context bridge for bodycam IPC
│   ├── bodycam-recorder.js     # Desktop capture via MediaRecorder in hidden window
│   └── package.json            # Electron build configuration
├── logs/                       # Auto-generated log files
│   ├── app.log                 # Application events
│   ├── error.log               # Errors & warnings
│   └── access.log              # HTTP request log
├── public/
│   ├── audio/                  # Alert sound files (new call, bolo, etc.)
│   ├── css/                    # Page-specific stylesheets
│   ├── images/                 # Logos, icons, map assets, template PDFs
│   ├── js/                     # Page-specific JavaScript
│   ├── *.html                  # All frontend pages
│   ├── ads.txt                 # Ad network verification
│   ├── robots.txt              # Search engine crawl rules
│   └── sitemap.xml             # SEO sitemap
├── scripts/
│   └── encrypt-existing-erlc-keys.js   # One-time migration script
├── src/
│   ├── server.js               # Express app entry point, route registration
│   ├── db.js                   # MySQL connection pool
│   ├── config/
│   │   └── webhook-templates.json  # Discord embed template definitions
│   ├── jobs/
│   │   ├── erlcPoller.js       # ERLC API proxy + live-units + call sync
│   │   └── robloxManager.js    # Roblox OAuth account linking
│   ├── middleware/
│   │   └── auth.middleware.js   # JWT verification + role/permission middleware
│   ├── radio/
│   │   └── signaling.js        # WebSocket signaling server for WebRTC voice radio
│   ├── report-templates/
│   │   ├── index.js            # Main entry — exports renderer + config
│   │   ├── renderer.js         # PDF template renderer (pdf-lib field injection)
│   │   └── field-positions.js  # Template field coordinate configs (LEO, FR, DOT)
│   ├── routes/
│   │   ├── auth.routes.js          # Discord OAuth, session management
│   │   ├── audit.routes.js         # Server audit log
│   │   ├── bodycam.routes.js       # Bodycam recording metadata + supervisor requests
│   │   ├── bolos.routes.js         # BOLO (Be On the LookOut) system
│   │   ├── call-notes.routes.js    # Auto-generated + manual call notes / audit trail
│   │   ├── calls.routes.js         # Call management (CRUD, priority, status)
│   │   ├── characters.routes.js    # Character records
│   │   ├── departments.routes.js   # Department CRUD
│   │   ├── dept-activity.routes.js # Shift activity tracking
│   │   ├── dept-docs.routes.js     # Department documents (SOPs, policies)
│   │   ├── dept-infractions.routes.js  # Department infractions
│   │   ├── dept-members.routes.js       # Department membership
│   │   ├── dept-ranks.routes.js         # Rank definitions with permissions
│   │   ├── dept-vehicles.routes.js      # Department fleet vehicle registry
│   │   ├── firearms.routes.js      # Firearm registry
│   │   ├── reports.routes.js       # Incident reports
│   │   ├── search.routes.js        # Cross-entity search
│   │   ├── servers.routes.js       # Server CRUD, join codes, members
│   │   ├── temp-characters.routes.js   # Auto-generated temp character system
│   │   ├── units.routes.js         # Unit clock-in/out, status updates
│   │   ├── users.routes.js         # User profile and settings
│   │   ├── vehicles.routes.js      # Vehicle registration
│   │   └── verification.routes.js  # Email verification codes
│   └── utility/
│       ├── crypto.js            # AES-256-GCM encryption/decryption
│       ├── jwt.js               # JWT sign/verify helpers
│       ├── logger.js            # File-based logging (app, error, access)
│       ├── mailler.js           # Email (Nodemailer wrapper)
│       └── webhook.js           # Discord webhook sender (audit, clock-in, bolo, report)
├── todo                         # Project TODO list
├── package.json
├── USER_MANUAL.md
└── readme.md
```

---

## API Overview

All authenticated endpoints require a `Bearer <token>` Authorization header obtained from the Discord OAuth flow.

### 🔐 Authentication

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/auth/discord/login`        | Initiate Discord OAuth login              |
| GET    | `/auth/discord/callback`     | Discord OAuth callback (handled by Discord)| 
| GET    | `/auth/sessions`             | List active sessions for the current user |
| DELETE | `/auth/sessions`             | Revoke all sessions except current        |
| GET    | `/auth/roblox/link`          | Initiate Roblox OAuth account linking     |
| GET    | `/auth/roblox/callback`      | Roblox OAuth callback                     |
| DELETE | `/auth/roblox/unlink`        | Unlink linked Roblox account              |
| GET    | `/auth/roblox/me`            | Get current user's linked Roblox info     |

### 👤 Users

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/users/*`                   | User profile and settings                 |

### 🖥️ Servers

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/servers/*`                 | Server CRUD, members, join codes          |

### 🚔 Units

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/units/*`                   | Clock in/out, unit status updates         |

### 📞 Calls

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/calls/*`                   | Active calls, history, close calls        |

### 📝 Call Notes

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/call-notes/:callId`        | Get auto-generated + manual notes for a call |

### 🚨 BOLOs

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/bolos/*`                   | BOLO create, list, deactivate             |

### 📄 Reports (with PDF generation)

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/reports/*`                 | Incident reports with PDF template rendering |

### 🔍 Search

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/search/*`                  | Cross-entity search (characters, vehicles, firearms) |

### 👤 Characters

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/characters/*`              | Character record management               |

### 🚗 Vehicles

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/vehicles/*`                | Vehicle registration                      |

### 🔫 Firearms

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/firearms/*`                | Firearm registry with stolen tracking     |

### 🏢 Departments

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/departments/*`             | Department CRUD                           |
| GET    | `/dept-members/*`            | Department membership                     |
| GET    | `/dept-ranks/*`              | Rank definitions with permissions         |
| GET    | `/dept-docs/*`               | Department documents                      |
| GET    | `/dept-infractions/*`        | Department infractions                    |
| GET    | `/dept-activity/*`           | Shift activity tracking                   |
| GET    | `/dept-vehicles/*`           | Department fleet vehicle registry         |

### 🔍 Auditing

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/audit/*`                   | Server audit log                          |

### 🎮 ERLC Integration

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/erlc/:serverId/server`     | Server status & info                      |
| GET    | `/erlc/:serverId/players`    | List online players                       |
| GET    | `/erlc/:serverId/joinlogs`   | Player join logs                          |
| GET    | `/erlc/:serverId/killlogs`   | Kill/death logs                           |
| GET    | `/erlc/:serverId/commandlogs`| Server command logs                       |
| GET    | `/erlc/:serverId/vehicles`   | In-game vehicle list                      |
| GET    | `/erlc/:serverId/queue`      | Server join queue                         |
| GET    | `/erlc/:serverId/staff`      | Server staff/administrators               |
| GET    | `/erlc/:serverId/calls`      | Active 911/dispatch calls from ERLC       |
| GET    | `/erlc/:serverId/live-units`  | ERLC players fused with CAD units         |
| GET    | `/erlc/:serverId/emergency-calls`  | Normalised emergency calls            |
| GET    | `/erlc/:serverId/players/positions` | Players with position data for map  |
| POST   | `/erlc/:serverId/import-call` | Import an ERLC call into the CAD          |
| POST   | `/erlc/:serverId/sync-calls`  | Batch-sync ERLC calls into CAD (deduped)  |
| POST   | `/erlc/:serverId/bans`       | Ban players                               |
| DELETE | `/erlc/:serverId/bans`       | Unban players                             |
| POST   | `/erlc/:serverId/command`    | Execute server command                    |
| POST   | `/erlc/:serverId/validate-key` | Validate an ERLC server key             |

### 📹 Bodycam

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| POST   | `/bodycam/activate`          | Log bodycam activation (linked to call)   |
| PATCH  | `/bodycam/:id/deactivate`    | Log bodycam deactivation                  |
| GET    | `/bodycam/recordings`        | List current user's recordings            |
| GET    | `/bodycam/recordings/by-call/:callId` | Supervisor view of call's recordings |
| POST   | `/bodycam/:id/request`       | Supervisor requests bodycam from officer  |
| GET    | `/bodycam/requests/pending`  | Check pending requests on clock-in        |
| POST   | `/bodycam/:id/upload`        | Officer marks recording as uploaded       |
| GET    | `/bodycam/download/:token`   | Get download info (24-hour expiry)        |

### 🎭 Temp Characters

| Method | Endpoint                              | Description                              |
|--------|---------------------------------------|------------------------------------------|
| GET    | `/temp-chars/:serverId`               | List all temp characters for a server    |
| GET    | `/temp-chars/:serverId/mine`          | List current user's temp chars           |
| POST   | `/temp-chars/create`                  | Auto-create temp character               |
| POST   | `/temp-chars/remove`                  | Remove temp character                    |
| POST   | `/temp-chars/auto-sync/:serverId`     | Sync temp chars with ERLC player list    |

### ✅ Email Verification

| Method | Endpoint                     | Description                               |
|--------|------------------------------|-------------------------------------------|
| POST   | `/verification/*`            | Send/verify 6-digit email codes           |

### 🎙️ Radio / WebSocket Signaling

The radio system uses a WebSocket endpoint at `/radio` for peer-to-peer voice communication.

| Parameter     | Description                              |
|---------------|------------------------------------------|
| `token`       | JWT authentication token (query param)   |
| `serverId`    | Server ID for room scoping               |
| `channel`     | Channel name (LEO, FR, DOT, DISPATCH)    |

**WebSocket Message Protocol:**
- `join`, `leave` — Room membership
- `offer`, `answer` — WebRTC SDP exchange
- `ice-candidate` — ICE candidate relay
- `peer-joined`, `peer-left`, `channel-active` — Server broadcasts

---

## Logging

The application logs to three files in the `logs/` directory:

- **app.log** — General information and all logged events
- **error.log** — Errors and warnings (with stack traces)
- **access.log** — HTTP request/response logging (method, URL, status, duration, IP)

Logs are created automatically on first run. The directory is gitignored.

---

## Development

```bash
# Start with file watching (auto-restart on changes)
npm run dev

# No test suite configured yet
npm test   # placeholder
```

### Adding New Features

1. Add database migrations to `config/database.sql`
2. Create route handlers in `src/routes/`
3. Add frontend pages in `public/` with corresponding CSS and JS
4. Register routes in `src/server.js`

---

## Security

- **ERLC Keys** — Encrypted with AES-256-GCM before storage. Never exposed to clients.
- **JWT Sessions** — All API requests authenticated via signed JWTs. Sessions can be revoked.
- **HTTP Security** — Helmet middleware with CSP headers. Rate limiting available.
- **CORS** — Restrictive origin policy via `ALLOWED_ORIGINS`.
- **Email Verification** — Destructive actions require 6-digit code sent to the user's email.
- **WebSocket Auth** — Radio signaling requires valid JWT token as query parameter.

---

## License

ISC

## Author

**Muhammad Faiq Imran**

---

*Built for the Roblox roleplay community. Not affiliated with Roblox Corporation or ERLC.*
If you are a roleplay community with your own game or with scripting ability contact me via discord if you want to integrate this CAD with your game/server.

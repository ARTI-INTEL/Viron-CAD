# Ultimate CAD

A modern, web-based Computer-Aided Dispatch (CAD) system for Roblox roleplay communities, built with **Node.js**, **Express**, and **MySQL**. Features real-time ERLC (Emergency Response: Liberty County) integration, Discord OAuth authentication, and a full-featured dispatch interface.

---

## Features

### 🚔 Dispatch System
- **Active Calls** — Create, update, and close calls with priority levels (Low, Medium, High, Critical)
- **Unit Management** — Clock in/out, update status (Available, Unavailable, On Scene, Enroute, Busy)
- **Role-Based CAD Views** — Dedicated interfaces for LEO, Fire & Rescue, DOT, and Dispatchers
- **In-Game Map** — Interactive CAD map with draggable markers and zoom support

### 🎮 ERLC Integration
- **Live Player Tracking** — View in-game players matched to CAD units by Roblox username
- **Emergency Calls Sync** — Import active 911 calls from your ERLC server into the CAD
- **Server Status & Logs** — Query join logs, kill logs, command logs, and vehicle lists
- **Moderation Actions** — Ban/unban players and execute server commands directly from the CAD
- **Encrypted Key Storage** — ERLC server keys are AES-256-GCM encrypted at rest

### 🏢 Department Management
- **Custom Departments** — Create LEO, FR, and DOT departments per server
- **Rank System** — Define custom rank hierarchies with permissions per department
- **Member Tracking** — Assign members to departments with role-based access
- **Activity Logging** — Track clock-in times and generate activity reports
- **Department Documents** — Upload and manage SOPs, policies, and reference docs
- **Infraction System** — Issue and track department-level infractions

### 👥 User & Server Management
- **Discord OAuth Login** — Sign in securely with your Discord account
- **Server Memberships** — Join servers via unique join codes
- **Role Management** — Owner, Admin, Moderator, and Member roles per server
- **Session Security** — View and revoke active sessions from the settings page
- **Email Verification** — 6-digit verification codes for destructive actions (delete server, delete account)

### 🔍 Search & Records
- **Character Records** — Full character profiles with flags and identifiers
- **Vehicle Registration** — Track vehicles by plate, VIN, model, and insurance status
- **Firearm Registration** — Serialized firearm registry with stolen status tracking
- **BOLOs** — Be On the LookOut for vehicles, persons, and property
- **Reports** — Generate and manage incident reports with detailed logging

---

## Tech Stack

| Layer           | Technology                        |
|-----------------|-----------------------------------|
| **Backend**     | Node.js, Express 5                |
| **Database**    | MySQL 8 with mysql2/promise       |
| **Auth**        | Discord OAuth 2, JWT (HS256)      |
| **Encryption**  | AES-256-GCM (ERLC server keys)    |
| **Email**       | Nodemailer (SMTP)                 |
| **Security**    | Helmet, CORS, Rate Limiting       |
| **Frontend**    | Vanilla JS, CSS (no framework)    |
| **Fonts**       | Inter (Google Fonts)              |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [MySQL](https://dev.mysql.com/downloads/) 8.0+
- A [Discord Application](https://discord.com/developers/applications) for OAuth
- (Optional) An ERLC server key for game integration
- (Optional) An SMTP server for email verification codes

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

# ── Server ────────────────────────────────────────────
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
# Comma-separated if multiple origins:
# ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
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
4. Add a redirect URL: `https://yourdomain.com/auth/discord/callback` (or `http://localhost:3000/auth/discord/callback` for local dev)
5. Copy the **Client ID** and **Client Secret** into your `.env` file
6. The OAuth2 scope used is `identify guilds email`

---

## Project Structure

```
ultimate-cad/
├── config/
│   └── database.sql          # MySQL schema dump
├── logs/                     # Auto-generated log files
│   ├── app.log               # Application events
│   ├── error.log             # Errors & warnings
│   └── access.log            # HTTP request log
├── public/
│   ├── css/                  # Page-specific stylesheets
│   ├── js/                   # Page-specific JavaScript
│   ├── *.html                # All frontend pages
│   └── sitemap.xml           # SEO sitemap
├── scripts/
│   └── encrypt-existing-erlc-keys.js
├── src/
│   ├── server.js             # Express app entry point
│   ├── db.js                 # MySQL connection pool
│   ├── jobs/
│   │   ├── erlcPoller.js     # ERLC API proxy routes
│   │   └── robloxManager.js  # Roblox OAuth handler
│   ├── middleware/
│   │   └── auth.middleware.js # JWT + role auth middleware
│   ├── routes/
│   │   ├── auth.routes.js        # Discord OAuth, sessions
│   │   ├── servers.routes.js     # Server CRUD, members
│   │   ├── units.routes.js       # Unit clock-in/out, status
│   │   ├── calls.routes.js       # Call management
│   │   ├── bolos.routes.js       # BOLO system
│   │   ├── reports.routes.js     # Incident reports
│   │   ├── characters.routes.js  # Character records
│   │   ├── vehicles.routes.js    # Vehicle registration
│   │   ├── firearms.routes.js    # Firearm registry
│   │   ├── search.routes.js      # Cross-entity search
│   │   ├── departments.routes.js # Department CRUD
│   │   ├── dept-members.routes.js
│   │   ├── dept-ranks.routes.js
│   │   ├── dept-docs.routes.js
│   │   ├── dept-infractions.routes.js
│   │   ├── dept-activity.routes.js
│   │   ├── verification.routes.js # Email verification codes
│   │   ├── audit.routes.js        # Server audit log
│   │   └── users.routes.js        # User profile
│   └── utility/
│       ├── crypto.js          # AES-256-GCM encryption
│       ├── jwt.js             # JWT sign/verify
│       ├── logger.js          # File-based logging
│       └── mailler.js         # Email (Nodemailer wrapper)
├── todo                       # Project TODO list
├── package.json
└── readme.md
```

---

## API Overview

All authenticated endpoints require a `Bearer <token>` Authorization header obtained from the Discord OAuth flow.

| Prefix               | Description                               |
|----------------------|-------------------------------------------|
| `GET /auth/discord/login` | Initiate Discord OAuth login           |
| `GET /auth/sessions` | List active sessions for the current user |
| `DELETE /auth/sessions` | Revoke all sessions except current     |
| `GET /users/*`       | User profile and settings                 |
| `GET /servers/*`     | Server CRUD, members, join codes          |
| `GET /units/*`       | Clock in/out, unit status updates         |
| `GET /calls/*`       | Active calls, history, close calls        |
| `GET /bolos/*`       | BOLO create, list, deactivate             |
| `GET /reports/*`     | Incident reports                          |
| `GET /search/*`      | Cross-entity search (characters, vehicles)|
| `GET /characters/*`  | Character record management               |
| `GET /vehicles/*`    | Vehicle registration                      |
| `GET /firearms/*`    | Firearm registry                          |
| `GET /departments/*` | Department CRUD                           |
| `GET /dept-members/*`| Department membership                     |
| `GET /dept-ranks/*`  | Rank definitions                          |
| `GET /dept-docs/*`   | Department documents                      |
| `GET /dept-infractions/*` | Department infractions              |
| `GET /dept-activity/*`   | Shift activity tracking              |
| `GET /audit/*`       | Server audit log                          |
| `GET /erlc/*`        | ERLC integration proxy (live units, calls)|
| `POST /verification/*`   | Send/verify email codes               |

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

---

## License

ISC

## Author

**Muhammad Faiq Imran**

---

*Built for the Roblox roleplay community. Not affiliated with Roblox Corporation or ERLC.*
If you are a roleplay community with your own game or with scripting ability contact me via discord if you want to integrate this CAD with your game/server.

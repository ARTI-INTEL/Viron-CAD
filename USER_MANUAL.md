# 🚔 Ultimate CAD — User Manual

**Version:** 1.0  
**Author:** Muhammad Faiq Imran  
**Purpose:** A comprehensive Computer-Aided Dispatch (CAD) system for Roblox roleplay communities.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [The Dashboard](#3-the-dashboard)
4. [The Server Page](#4-the-server-page)
5. [Server Settings (Owner)](#5-server-settings-owner)
6. [Department Management](#6-department-management)
7. [Dispatcher CAD Interface](#7-dispatcher-cad-interface)
8. [LEO CAD Interface](#8-leo-cad-interface)
9. [Fire & Rescue CAD Interface](#9-fire--rescue-cad-interface)
10. [DOT CAD Interface](#10-dot-cad-interface)
11. [Civilian Records](#11-civilian-records)
12. [Account Settings & Security](#12-account-settings--security)
13. [ERLC Integration](#13-erlc-integration)
14. [The CAD Map](#14-the-cad-map)
15. [Bodycam System](#15-bodycam-system)
16. [WebRTC Voice Radio](#16-webrtc-voice-radio)
17. [Call Notes & Activity Log](#17-call-notes--activity-log)
18. [Discord Bot](#18-discord-bot)
19. [Alert Sounds System](#19-alert-sounds-system)
20. [Status Codes (10-Codes)](#20-status-codes-10-codes)
21. [Glossary](#21-glossary)
22. [FAQ & Troubleshooting](#22-faq--troubleshooting)

---

## 1. Introduction

**Ultimate CAD** is a web-based Computer-Aided Dispatch system built for Roblox roleplay communities. It provides a complete suite of tools for emergency services roleplay, including multi-agency dispatch, incident reporting, record keeping, department management, and real-time integration with **Emergency Response: Liberty County (ERLC)**.

### Key Features at a Glance

| Feature | Description |
|---|---|
| **Multi-Agency CAD** | Dedicated interfaces for Law Enforcement (LEO), Fire & Rescue, Department of Transportation (DOT), and Dispatchers |
| **Department Management** | Custom rank hierarchies, roles/permissions, infractions, documents, vehicles, and activity tracking |
| **ERLC Integration** | Real-time player tracking via WebSocket, in-game 911 sync, server moderation, encrypted key storage, and auto temp character creation |
| **Records & Search** | Character profiles, vehicle registration, firearm registry, BOLO system |
| **Reporting** | Written warnings, citations, arrests, incident/medical/death/tow reports with PDF template rendering |
| **Live Map** | Canvas-based map showing ERLC player positions, CAD unit locations, and active call pins |
| **Call Notes** | Auto-generated audit trail for call updates, unit attachments, and bodycam activations |
| **Bodycam System** | Desktop recording via Electron app with supervisor request flow and 24-hour expiry |
| **WebRTC Voice Radio** | Real-time peer-to-peer voice communication with per-department channels |
| **Discord Webhooks** | Real-time notifications for audit events, clock-ins, reports, and BOLOs |
| **Discord Bot** | Standalone bot with slash commands for link status, active units, and department role sync |
| **Alert Sounds** | Distinct audio alerts for new calls, BOLOs, call attachments, and updates |
| **Account Security** | Discord OAuth login, Roblox OAuth linking, session management, email verification, bodycam keybinds |

### Who Can Use Ultimate CAD?

- **Server Owners** — Full control over servers, departments, and members
- **Dispatchers** — Multi-agency call management, BOLO broadcasting, unit monitoring
- **LEO Officers** — Law enforcement dispatch, BOLOs, reporting, warrant management
- **Fire & Rescue** — Fire/EMS dispatch, medical and death reporting
- **DOT Officers** — Transportation dispatch, tow and incident reporting
- **Civilians** — Character and vehicle management, firearm registration

---

## 2. Getting Started

### 2.1 Logging In

1. Navigate to your Ultimate CAD instance in your browser.
2. Click **"Login with Discord"** on the landing page.
3. You will be redirected to Discord's authorization screen.
4. Authorize the application (scope: `identify`, `guilds`, `email`).
5. After successful authentication, you will be redirected to the **Dashboard**.

![Landing Page Flow]  
*The landing page features a hero section with feature cards below describing each major system.*

### 2.2 First-Time Login

Upon your first login, you will have no servers. You can either:

- **Create a Server** — Become an owner with full administrative control.
- **Join a Server** — Enter an 8-character join code provided by an existing server owner.

Both options are available through the **Dashboard** (see Section 3).

### 2.3 Navigation Overview

The application uses a simple navigation flow:

```
Landing Page → Dashboard → Server Page → CAD Interface / Server Settings / Department Management
                                  ↓
                         Civilian Records
```

Each page has a navbar with relevant navigation buttons. Use the **Dashboard** button to return to your server list, and the **Settings** button to manage your account.

---

## 3. The Dashboard

The **Dashboard** (`dashboard.html`) is your home screen after logging in.

### 3.1 Server List

- All servers you belong to are displayed in a list.
- Each row shows the **server name**, **member count**, and **your role** (Owner/Member).
- Click any server row to enter that server's **Server Page**.
- Use the **Search** bar at the top to filter servers by name.

### 3.2 Creating a Server

1. Click **"Create Server"** at the bottom of the page.
2. In the modal that appears, fill in:
   - **Server Name** — Required. The name of your roleplay server.
   - **Join Code** — Auto-generated. Share this code so others can join. You can edit it.
   - **Description** — Optional. A short description of your server.
   - **Discord Server** — Optional. Link a Discord server you own to the CAD server.
3. Click **"Create"** to create the server. You will automatically become the **Owner**.

### 3.3 Joining a Server

1. Click **"Create Server"** to open the modal.
2. Click the **"Join Server"** tab at the top of the modal.
3. Enter the **8-character join code** provided by the server owner.
4. Click **"Join"** to join the server as a **Member**.

### 3.4 Settings Button

Click the **Settings** button in the navbar to access your **Account Settings** page (see Section 12).

---

## 4. The Server Page

The **Server Page** (`server-page.html`) is the hub for a specific server. It displays department panels for clocking in and accessing CAD interfaces.

### 4.1 Department Panels

Three department panels are shown — **Law Enforcement (LEO)**, **Fire & Rescue (F&R)**, and **Department of Transportation (DOT)**.

For each department, you will see:

| Field | Description |
|---|---|
| **Name** | Your in-character name (required to clock in) |
| **Callsign** | Your unit callsign (required to clock in) |
| **Rank** | Your rank in this department (auto-filled if you're a dept member) |
| **Department** | Dropdown to select your specific department (e.g., LSPD, BCSO) |
| **Vehicle** | Dropdown to select an available department vehicle (if enabled by the dept) |

### 4.2 Clocking In

1. Fill in your **Name** and **Callsign**.
2. Select your **Department** from the dropdown (departments are configured in Server Settings).
3. If the department has **Department Vehicles** configured and available, a vehicle dropdown will appear — select an available unit.
4. Click the **"Join [Dept] CAD"** button to clock in.
5. You will be taken to that department's **CAD Interface** (see Sections 7–10).

> **Note:** When you clock out, your assigned vehicle is automatically released for other members.

### 4.3 Navigation Buttons

- **Server Settings** (Owner only) — Access server configuration (see Section 5).
- **Manage Dept** (HR only) — Access Department Management (see Section 6).
- **Dashboard** — Return to the server list.
- **Civilian / Character** — Access the Civilian Records page (see Section 11).
- **Dispatcher** — Access the Dispatcher CAD (see Section 7).

> **Note:** The **Server Settings** button is only visible to the server owner. The **Manage Dept** button appears when you're clocked in with HR_ACCESS. The **Dispatcher** button is available to anyone.

---

## 5. Server Settings (Owner)

The **Server Settings** page (`server-settings.html`) is only accessible by the **server owner**. It provides full control over the server, its members, and integrations.

### 5.1 Accessing Server Settings

From the Server Page, click the **"Server Settings"** button in the navbar (Owner only).

### 5.2 Members Panel (Left Side)

The left panel displays all server members in a table:

| Column | Description |
|---|---|
| **Member** | Username of the member |
| **Role** | Their role: Owner, Admin, Moderator, or Member |
| **Date Joined** | When they joined the server |
| **Action** | Kick or Change Role options |

**Member Management:**

- **Change Role:** Click the role button next to a member to open a role picker. Choose between Admin, Moderator, or Member.
- **Kick Member:** Click the kick button to remove a member from the server. A confirmation modal will appear.
- **Kicked members** are also clocked out of any active unit sessions.

### 5.3 Server Configuration (Right Side)

#### Server Name

Edit the server name and click **"Save Settings"**.

#### Join Code

- The join code is used by others to join your server.
- Click **"Copy"** to copy the code to your clipboard.
- Click **"Regen"** to generate a new random join code.

#### Description

Set a short description for your server.

#### Discord Server ID

Link your server to a Discord guild by pasting its ID here. This enables the Discord Bot's `/units` and `/dept-role-sync` commands to find your CAD server.

#### ERLC Server Key

Paste your **ERLC (Emergency Response: Liberty County)** server API key to enable game integration. The key is **AES-256-GCM encrypted** before storage and never exposed to clients.

- Click **"Test"** to verify the key works with the ERLC API.
- Status messages show whether the key is valid.
- ERLC integration enables live player tracking, 911 call sync, server moderation, and auto temp character creation.

#### Discord Audit Webhook URL

Paste a Discord webhook URL here to receive real-time notifications for **audit events**:

| Event | Description |
|---|---|
| **MEMBER_KICKED** | When a member is kicked from the server |
| **CALL_CREATED / CALL_CLOSED** | When calls are created or closed |
| **REPORT_EDITED / REPORT_DELETED** | When reports are modified |
| **INFRACTION_GIVEN / INFRACTION_REMOVED** | Department infraction events |
| **FIREARM_MARKED_STOLEN / RECOVERED** | Firearm stolen/recovered events |
| **VEHICLE_MARKED_STOLEN / RECOVERED** | Vehicle stolen/recovered events |

> Note: Clock-in, report-filed, and BOLO notifications currently require separate webhook configuration not yet available in the UI.

#### Auto Temp Characters

Toggle this option to automatically create temporary characters (with randomized names, licenses, plates, and vehicles) for players when they join the ERLC server. Temp characters are automatically removed when players leave. Works with the **Temp Character Sync** system.

#### Enforce Character Name

Toggle this option to require users to use their available character names as their in-game display name when creating characters.

#### Departments

Configure departments that members can join:

1. Enter a **department name** (e.g., "LSPD", "BCSO", "SAFR").
2. Select the **department type**: LEO, F&R, or DOT.
3. Click **"Add"** to create the department.
4. Departments appear in the list and can be removed with the ✕ button.

Members will see these departments in the dropdown when clocking in on the Server Page. If no custom departments are configured, default names are used.

### 5.4 Danger Zone

- **Delete Server:** Permanently deletes the server and all its data (calls, BOLOs, reports, members). A verification code is sent to your email for confirmation. You must also type the server name to confirm.

---

## 6. Department Management

The **Department Management** page (`dept-manage.html`) is accessible to users with **HR_ACCESS** permission within a department. It provides tools for managing employees, ranks, roles, vehicles, and documents.

### 6.1 Accessing Department Management

From the Server Page, click the **"Manage Dept"** button (available if you have HR_ACCESS in your department).

> **Note:** The button is shown in the department panel when you are clocked in and have HR permissions.

### 6.2 Tabs Overview

| Tab | Description |
|---|---|
| **Employees** | Manage department members, assign ranks, roles, give infractions |
| **Ranks** | Define custom rank names with permissions |
| **Additional Roles** | Create certification/role tags (e.g., K9, SWAT, EMT) |
| **Vehicles** | Manage department-owned vehicles for clock-in assignment |
| **Documents** | Add reference URLs (SOPs, policies, guides) |

### 6.3 Employees Tab

**Adding a Member:**
1. Click **"Add Member"**.
2. Enter the **User ID** of the member to add.
3. Optionally select an initial **Rank**.
4. Click **"Add"**.

**Managing Members:**
- Click **"Edit"** on any member to change their rank and assign additional roles.
- Click **"Infraction"** to issue a department infraction with a reason.
- The **Activity** column shows the member's report count for the current week.

**Minimum Weekly Activity:**
Set a minimum report count for the week. Members below this threshold are flagged.

### 6.4 Ranks Tab

Ranks define a member's position and permissions within the department.

**Creating a Rank:**
1. Click **"Add Rank"**.
2. Enter a **Rank Name** (e.g., Sergeant, Lieutenant, Chief).
3. Select **Permissions** from checkboxes:

| Permission | Description |
|---|---|
| **HR_ACCESS** | Can manage department settings, employees, and all dept features |
| **SUPERVISOR** | Can approve warrants and read reports |
| **MANAGE_ROLES** | Can manage additional roles assigned to members |

4. Click **"Create"**.

### 6.5 Additional Roles Tab

Additional roles are certification tags that can be assigned to members (e.g., K9 Handler, SWAT, EMT, Negotiator).

**Creating a Role:**
1. Click **"Add Role"**.
2. Enter a **Role Name**.
3. Click **"Create"**.

Roles appear in the **Edit Member** modal where HR users can assign them to employees.

### 6.6 Vehicles Tab

Department vehicles can be listed here. When the **"Enable assigned vehicles on clock-in"** toggle is on, members will see a vehicle dropdown when clocking in on the Server Page.

**Key rules:**
- A vehicle can only be assigned to **one unit at a time**.
- When a unit clocks out, their vehicle is automatically released.
- If a unit re-clocks in (same shift), their previous vehicle is released first.

**Adding a Vehicle:**
1. Click **"Add Vehicle"**.
2. Fill in: **Name** (e.g., "Patrol Unit 1"), **Model** (e.g., "Ford Explorer"), **Plate**, and **Color**.
3. Click **"Create"**.

The **Assigned To** column shows which unit is currently using the vehicle.

### 6.7 Documents Tab

Store links to department documents such as SOPs, policy manuals, or training guides.

**Adding a Document:**
1. Click **"Add Document"**.
2. Enter a **Title** and **URL** (e.g., a Google Docs link).
3. Click **"Create"**.

Department documents are visible to all members on the **Home** panel of each CAD interface.

---

## 7. Dispatcher CAD Interface

The **Dispatcher CAD** (`dispatcher-cad.html`) is the multi-agency control center. Dispatchers can monitor all units, manage calls across all departments, broadcast BOLOs, and coordinate response.

### 7.1 Accessing Dispatcher CAD

From the Server Page, click **"Dispatcher"** at the bottom.

### 7.2 Panels (Navigation Bar)

| Panel | Description |
|---|---|
| **Home** | Welcome screen with agency overview |
| **Map** | Live ERLC map with player positions, units, and call pins |
| **CAD** | Main dispatch console — calls, BOLOs, units |
| **Search** | Cross-entity search (people, vehicles, firearms) |
| **Reports** | View submitted reports |
| **Call History** | View closed/past calls |
| **Notepad** | Pop-up note pad for taking notes |

### 7.3 Status Codes

Use the status buttons in the navbar to update your availability:

| Code | Meaning | Color |
|---|---|---|
| **10-8** | Available / In Service | Green |
| **10-7** | Out of Service / Off Duty | Red |
| **10-97** | On Scene | Blue |
| **10-23** | Arrived at Location | Green |
| **10-6** | Busy | Yellow |

### 7.4 CAD Panel — Active Calls

Displays all active calls across all agencies. Each row shows:

- **Call #** — Unique call ID
- **Nature** — Type of call (e.g., Traffic Stop, Structure Fire)
- **Location** — Where the call is happening
- **Priority** — Low, Medium, High, or Critical
- **Unit** — Which unit(s) are assigned

**Creating a Call:**
1. Click **"Create Call"**.
2. Fill in: **Nature**, **Title**, **Location**, **Priority**, **Status**.
3. Optionally add a **Description**.
4. Click **"Create"**.

**Closing a Call:**
Click the **"CODE 4"** button on any active call to mark it as closed.

### 7.5 CAD Panel — 911 Calls (ERLC)

If ERLC integration is configured, in-game 911 calls appear here. Each shows:

- **ERLC ID** — The call's ID from the game server
- **Caller** — The player who initiated the call
- **Nature** — The nature of the emergency
- **Location** — Where the call originated
- **Status** — Pending or Imported

Click **"Import"** to convert an ERLC 911 call into a CAD call.

### 7.6 CAD Panel — Active BOLOs

BOLOs (Be On the LookOut) are broadcast to all units.

**Creating a BOLO:**
1. Click **"Create BOLO"**.
2. Select type: **Person** or **Vehicle**.
3. Enter **Last Known Location** and **Description**.
4. Click **"Create"**.

BOLOs can be removed by clicking the **"Remove"** button.

### 7.7 CAD Panel — Active Units

Shows all clocked-in units across all agencies:

- **Callsign** — Unit callsign
- **Type** — LEO / FD / DOT
- **Department** — Full department name
- **Location** — Unit's last known location
- **Status** — Current 10-code status

### 7.8 Search Panel

Search across three databases:

- **Search PED** — Search characters by first or last name
- **Search Car** — Search vehicles by license plate or VIN
- **Search Gun** — Search firearms by serial number

Results appear in tables below each search box.

### 7.9 Call History

View all closed/past calls with a search filter to find specific calls.

### 7.10 Notepad

A pop-up text area for taking notes during your shift. Notes persist locally.

---

## 8. LEO CAD Interface

The **LEO CAD** (`leo-cad.html`) is designed for law enforcement officers. It includes all the features of the dispatcher interface plus law enforcement-specific tools.

### 8.1 Accessing LEO CAD

From the Server Page, select a LEO department, fill in your details, and click **"Join LEO CAD"**.

### 8.2 Panels (Navigation Bar)

| Panel | Description |
|---|---|
| **Home** | Welcome screen + department documents |
| **Map** | Live ERLC map |
| **CAD** | Active calls + BOLOs |
| **Search** | Full search with detail popups for PED, vehicles, firearms |
| **Reports** | File written warnings, citations, arrests, incident reports, warrants |
| **Call History** | Past calls |
| **Notepad** | Pop-up note pad |
| **Supervisor** | Supervisor panel (warrant approvals, officer search, call reports) |

### 8.3 CAD Panel

Similar to the Dispatcher CAD but shows only LEO-related calls and BOLOs.

- **Self-Dispatch:** Click the **"Attach"** button on any active call to assign yourself to it.
- **Detach:** Click **"Detach"** to remove yourself from a call.

### 8.4 Search Panel

The LEO search has enhanced functionality:

- **PED Detail Popup:** Click on a search result to see full character details, including associated vehicles, firearms, and report history.
- **Vehicle Detail Popup:** View full vehicle information.
- **Gun Detail Popup:** View firearm details with serial number and owner.

### 8.5 Reports Panel

LEO officers can file the following report types:

| Report Type | Description |
|---|---|
| **Written Warning** | Issue a formal written warning to a subject |
| **Citation** | Issue a traffic/parking citation |
| **Arrest** | File an arrest report with charges |
| **Incident Report** | General incident documentation |
| **Warrant** | File a warrant request (requires supervisor approval) |

**Filing a Report:**
1. Select the report type tab.
2. Fill in the required fields (subject name, details, charges, etc.).
3. Click **"Submit Report"**.
4. The report is saved and logged for activity tracking.

### 8.6 Supervisor Panel

Available to users with **SUPERVISOR** or **HR_ACCESS** permissions.

- **Warrant Approvals:** View pending warrants and approve or deny them.
- **Officer Search:** Search department members and view their submitted reports.
- **Call Reports:** Enter a Call ID to view all reports associated with that call.

---

## 9. Fire & Rescue CAD Interface

The **F&R CAD** (`fr-cad.html`) is designed for fire and rescue personnel.

### 9.1 Accessing F&R CAD

From the Server Page, select a Fire & Rescue department and click **"Join F&R CAD"**.

### 9.2 Panels

| Panel | Description |
|---|---|
| **Home** | Welcome screen + department documents |
| **Map** | Live ERLC map |
| **CAD** | Active calls |
| **Search** | PED and vehicle search with detail popups |
| **Reports** | File incident, medical, or death reports |
| **Call History** | Past calls |
| **Notepad** | Pop-up note pad |
| **Supervisor** | Supervisor panel (call reports, officer search) |

### 9.3 Reports Panel

F&R officers can file:

| Report Type | Description |
|---|---|
| **Incident Report** | General fire/rescue incident documentation |
| **Medical Report** | Patient assessment, treatment, and transport details |
| **Death Report** | Report on deceased individuals, cause of death |

### 9.4 Supervisor Panel

Similar to LEO supervisor panel but without warrant approvals (warrants are LEO-specific).

---

## 10. DOT CAD Interface

The **DOT CAD** (`dot-cad.html`) is designed for Department of Transportation officers.

### 10.1 Accessing DOT CAD

From the Server Page, select a DOT department and click **"Join DOT CAD"**.

### 10.2 Panels

| Panel | Description |
|---|---|
| **Home** | Welcome screen + department documents |
| **Map** | Live ERLC map |
| **CAD** | Active calls |
| **Search** | PED and vehicle search with detail popups |
| **Reports** | File incident or tow reports |
| **Call History** | Past calls |
| **Notepad** | Pop-up note pad |
| **Supervisor** | Supervisor panel (call reports, officer search) |

### 10.3 Reports Panel

DOT officers can file:

| Report Type | Description |
|---|---|
| **Incident Report** | Road hazard or general DOT incident |
| **Tow Report** | Vehicle tow documentation with plate, location, and reason |

---

## 11. Civilian Records

The **Civilian Records** page (`civilian.html`) allows players to manage their characters, vehicles, and firearms.

### 11.1 Accessing Civilian Records

From the Server Page, click **"Civilian / Character"** at the bottom.

### 11.2 Tabs

| Tab | Description |
|---|---|
| **Characters** | View and create character profiles |
| **Vehicles** | View all your registered vehicles |
| **Firearms** | View all your registered firearms |

### 11.3 Characters Tab

- Displays all your characters in a table with: First Name, Last Name, D.O.B., Age, Gender, Occupation, and Address.
- **Click** on a character row to see their associated **vehicles** and **firearms** in the sub-tables below.
- Click **"Add Character"** to create a new character.

**Creating a Character:**

Required fields: First Name, Last Name, D.O.B.

Optional fields: Gender, Occupation, Height, Weight, Skin Tone, Hair Color, Eye Color, Address.

### 11.4 Vehicles Tab

- Displays all vehicles registered to any of your characters.
- Columns: Owner, Plate, Model, Color, VIN, Reg Expiry, Insurance Status, Ins. Expiry.
- Click **"Add Vehicle"** to register a new vehicle.

**Adding a Vehicle:**

1. Select the **Owner** (one of your characters).
2. Fill in: **Plate** (required), **Model** (required), VIN, Color, Reg Expiry, Insurance Status, Ins. Expiry.
3. Click **"Add Vehicle"**.

### 11.5 Firearms Tab

- Displays all firearms registered to any of your characters.
- Columns: Owner, Serial #, Gun Name, Type.
- Click **"Register Firearm"** to add a new firearm.

**Registering a Firearm:**

1. Select the **Owner** (one of your characters).
2. Fill in: **Serial Number** (required), **Type** (required), Gun Name.
3. Click **"Register"**.

---

## 12. Account Settings & Security

The **Settings** page (`settings.html`) provides full account management.

### 12.1 Accessing Settings

Click **"Settings"** in the navbar on the Dashboard page.

### 12.2 Account Information

The top panel displays your account overview:

- **Username** — Your display name
- **Role** — Always "Member" (account-level)
- **Servers Joined** — Total count
- **Date Joined** — When you joined the CAD
- **Discord ID** — Your linked Discord ID

### 12.3 Account Settings

**Changing Your Username:**
1. Enter a new username (2–32 characters).
2. Optionally enter your **Email Address** (for verification codes).
3. Click **"Save Changes"**.

> **Note:** Changing your username does not affect your Discord login — it only changes your display name in the CAD.

### 12.4 Roblox Account Linking

Linking your Roblox account enables the CAD to match your ERLC in-game player to your CAD unit for live map tracking.

- **Link:** Click **"Link Roblox"** to be redirected to Roblox OAuth authorization. You'll need `ROBLOX_CLIENT_ID` and `ROBLOX_CLIENT_SECRET` configured on the server.
- **Unlink:** If already linked, click **"Unlink"** to remove the connection.
- Your linked Roblox username is displayed on the card.

### 12.5 Bodycam Keybind Settings

If you are using the **Electron desktop app**, you can configure a global hotkey to start/stop bodycam recording:

1. In the **Keybind** section, click the current keybind button (default: **F2**).
2. Press the key you want to assign (e.g., `F3`, `F4`, or `F1`).
3. The new keybind is saved automatically.

> **How it works:** The keybind is captured by the Electron main process using `globalShortcut`. When pressed, it triggers the bodycam start/stop function in the CAD interface. The keybind is persisted to disk and restored on app restart.

To switch between **window selection mode** and **auto-detect Roblox** mode:
- Select a specific Roblox window from the dropdown to always capture that window.
- The app auto-detects Roblox windows and offers them as capture targets.

### 12.6 Server Memberships

The right panel shows all servers you belong to:

- **Leave a Server:** Click the **"Leave"** button next to any non-owner server.
- Requires email verification if configured.

### 12.7 Session Security

View and manage all active login sessions:

- **Current Session:** Marked with a "Current" badge.
- **Revoke Session:** Click **"Revoke"** to terminate a session.
- **Log Out Everywhere Else:** Revokes all sessions except your current one.

### 12.8 Danger Zone

- **Leave All Servers:** Leave all servers where you are not the owner.
- **Delete Account:** Permanently delete your account and all associated data.

> Destructive actions may require email verification for security.

### 12.9 Logging Out

Click **"Log Out"** in the navbar to clear your session and return to the landing page.

---

## 13. ERLC Integration

Ultimate CAD integrates with **Emergency Response: Liberty County (ERLC)** to provide real-time game data within the CAD interface.

### 13.1 Setup

1. Go to **Server Settings** (as the server owner).
2. In the **ERLC Server Key** field, paste your API key from the ERLC dashboard.
3. Click **"Test"** to verify the key works.
4. Click **"Save Settings"** to store the encrypted key.

### 13.2 Features Enabled by ERLC Integration

| Feature | Where It Appears |
|---|---|
| **Live Player Tracking** | CAD Map — shows all online players with team colors, updated via WebSocket |
| **CAD Unit Positioning** | CAD Map — shows clocked-in units matched by Roblox username, live via WebSocket |
| **In-Game 911 Calls** | CAD panel — shows active ERLC emergency calls, with manual or auto-sync |
| **Auto Call Sync** | CAD panel — batch-import all active ERLC calls into the CAD with deduplication |
| **Player Positions Feed** | CAD Map — dedicated endpoint for live-position polling |
| **Server Status & Logs** | Via API — join logs, kill logs, command logs, staff list |
| **Vehicle Lists** | Via API — query ERLC server vehicles |
| **Moderation Actions** | Ban/unban players, execute server commands from the CAD |
| **Server Queue** | View the server join queue |
| **Temp Character Sync** | Auto-create/remove temp characters based on ERLC join/leave |

### 13.3 Unit Matching

CAD units are matched to ERLC players by **Roblox username**. To appear on the map:

1. Link your Roblox account in **Settings** (see Section 12.4).
2. Clock in as a unit in the CAD.
3. Be in-game on the ERLC server with the same Roblox username.

Your position will appear as a labeled dot on the CAD Map, updated in real-time via WebSocket.

### 13.4 Importing ERLC Calls

In the Dispatcher CAD, active 911 calls from ERLC appear in the **"911 Calls"** section.

**Manual Import:** Click **"Import"** on any individual call to create it as a CAD call.

**Auto Sync:** Click **"Sync All"** to batch-import all active ERLC calls at once. The system prevents duplicates by tagging imported calls with `[ERLC-<id>]` in the nature field.

### 13.5 Temp Character Auto-Sync

If **Auto Temp Characters** is enabled in Server Settings, the system can automatically:
- Create a temporary character (with randomized name, license, plate, and vehicle) when a player joins the ERLC server
- Remove the temp character when the player leaves

This sync can be triggered manually via the API or run automatically by the ERLC poller.

### 13.6 Player Positions Feed

A dedicated endpoint (`/erlc/:serverId/players/positions`) returns only ERLC players that have position data. This feed is consumed by the CAD Map module for efficient live tracking without polling the full player list.

---

## 14. The CAD Map

The **CAD Map** is a canvas-based interactive map that displays:

- **Background:** A map image or a stylized grid with compass rose.
- **Players:** Small dots representing ERLC players, colored by team:
  - 🟦 Blue = Law Enforcement
  - 🟥 Red = Fire/EMS
  - 🟨 Yellow = DOT
  - 🩶 Gray = Civilian
- **CAD Units:** Larger labeled dots for clocked-in units matched to ERLC players. Positions are updated via WebSocket for live tracking.
- **Call Pins:** Colored pins for active calls (color = priority level):
  - 🟢 Green = Low
  - 🟡 Yellow = Medium
  - 🟠 Orange = High
  - 🔴 Red = Critical

### 14.1 Map Controls

| Control | Action |
|---|---|
| **Drag** | Click and drag to pan the map |
| **Scroll Wheel** | Zoom in/out centered on cursor |
| **+ Button** (bottom-right) | Zoom in |
| **− Button** (bottom-right) | Zoom out |
| **↺ Button** (bottom-right) | Reset zoom and pan to default |

### 14.2 Legend

A legend in the bottom-left shows team colors. The bottom-right displays a count of online players and located units.

---

## 15. Bodycam System

The **Bodycam System** allows officers to record their gameplay from the Electron desktop app. Recordings are linked to active calls and can be requested by supervisors for review.

### 15.1 Overview

The bodycam system works in two parts:

1. **Desktop Recorder** (`electron/bodycam-recorder.js`) — Uses a hidden Electron `BrowserWindow` running MediaRecorder with desktop capture to record a target window.
2. **CAD Metadata API** (`src/routes/bodycam.routes.js`) — Tracks recording sessions, manages supervisor requests, and handles expiry.

### 15.2 Prerequisites

- You must be using the **Electron desktop app** (not a web browser).
- You must have a **Roblox game window** open (or another window you want to capture).
- You must be **clocked in** as a unit on the CAD.

### 15.3 Recording Workflow

**Starting a Recording:**
1. Click the **Bodycam** button in the CAD interface (or press the configured keybind, default **F2**).
2. The system notifies the CAD server that a recording has started and creates a log entry. If you're attached to a call, it's noted in the call notes.
3. The Electron app captures the selected window (auto-detects Roblox, or you can choose).
4. A red indicator shows that recording is active.

**Stopping a Recording:**
1. Click the **Bodycam** button again (or press the keybind).
2. The recording stops, and the video file is saved to `~/UltimateCAD/Bodycam/`.
3. The file name includes your user ID and call ID (e.g., `bc_42_17_2026-07-10T14-30-00.webm`).
4. The CAD server records the file path, and the recording is marked as "new."

### 15.4 Supervisor Request Flow

**Requesting Bodycam (Supervisor):**
1. In the **Supervisor Panel**, enter a Call ID to view all recordings for that call.
2. Click **"Request"** next to a recording to request it from the officer.
3. The recording status changes to "requested," and the officer is notified.
4. A call note is added documenting the request.

**Uploading Bodycam (Officer):**
1. When you clock in, any pending requests are shown as a popup notification.
2. Click **"Upload"** on a pending request.
3. The system generates a download token with a **24-hour expiry**.
4. The supervisor is notified that the footage is available.

**Downloading Bodycam (Supervisor):**
1. Navigate to the call's recordings list.
2. Click **"Download"** on an uploaded recording.
3. You have **24 hours** to download before the recording data is purged.

### 15.5 Call Notes Integration

Every bodycam action is logged in the **Call Notes** for the associated call:
- `📹 Bodycam activated by [Officer Name] (recording #42)`
- `📹 Bodycam #42 requested by supervisor [Name]`

### 15.6 Automatic Cleanup

The server runs a cleanup job every hour that purges expired bodycam recordings (those past the 24-hour download window).

---

## 16. WebRTC Voice Radio

The **WebRTC Voice Radio** system provides real-time, peer-to-peer voice communication between CAD units using WebRTC with a WebSocket signaling server.

### 16.1 Overview

- **Peer-to-Peer:** Voice data flows directly between users — no voice data passes through the server.
- **Per-Department Channels:** Separate voice rooms for LEO, FR, DOT, and Dispatch.
- **Mesh Topology:** Every peer connects directly to every other peer in the same channel.
- **JWT-Authenticated:** WebSocket connections require a valid JWT token.

### 16.2 How It Works

```
┌──────────┐      WebSocket (signaling)       ┌──────────┐
│  User A   │ ◄──────────────────────────────► │  Server   │
│  (LEO)   │                                   │(signaling)│
│          │◄──── WebRTC (direct audio) ──────►│          │
└──────────┘                                   └──────────┘
     ▲                                               ▲
     │                                               │
     │  WebSocket (signaling)                         │
     ▼                                               ▼
┌──────────┐                                   ┌──────────┐
│  User B   │                                   │  User C   │
│  (LEO)   │                                   │  (FR)    │
└──────────┘                                   └──────────┘
```

1. User connects to the WebSocket at `/radio?token=<jwt>&serverId=<id>&channel=<channel>`
2. Server assigns a peer ID and sends the list of connected peers
3. Peers exchange WebRTC offers, answers, and ICE candidates through the signaling server
4. Direct peer-to-peer audio streams are established
5. When a user leaves, remaining peers are notified

### 16.3 Channels

| Channel | Description |
|---|---|
| **LEO** | Law Enforcement voice channel |
| **FR** | Fire & Rescue voice channel |
| **DOT** | Department of Transportation voice channel |
| **DISPATCH** | Dispatchers voice channel |

Channel activity is broadcast in real-time, showing how many users are connected to each channel.

### 16.4 Using the Radio

1. Clock in to the CAD.
2. Navigate to the **Radio** panel or access the radio widget from the navbar.
3. Select your **channel** from the dropdown (auto-selected based on your department).
4. Click **"Connect"** to join the voice channel.
5. Use the **Push-to-Talk (PTT)** button or keybind to transmit.
6. Your browser will prompt for **microphone access** — grant it.

> **Note:** Microphone access is required for WebRTC audio. The Electron desktop app automatically grants this permission for the CAD domain.

### 16.5 Protocol Details

The WebSocket signaling protocol uses JSON messages:

| Message Type | Direction | Description |
|---|---|---|
| `join` | Client → Server | Join a voice channel |
| `leave` | Client → Server | Leave the current channel |
| `offer` | Bidirectional | WebRTC SDP offer exchange |
| `answer` | Bidirectional | WebRTC SDP answer exchange |
| `ice-candidate` | Bidirectional | ICE candidate relay |
| `peer-joined` | Server → Client | Notification that a new peer connected |
| `peer-left` | Server → Client | Notification that a peer disconnected |
| `channel-active` | Server → Client | Current active user count in channel |

---

## 17. Call Notes & Activity Log

The **Call Notes** system provides an automatic audit trail for every call in the CAD. Notes are generated automatically when important events occur, creating a chronological history of everything that happened during a call.

### 17.1 Auto-Generated Notes

The following events automatically create call notes:

| Event | Example Message |
|---|---|
| **Call Created** | `📞 Call created by DispatcherName` |
| **Call Updated** | `✏️ Call updated: nature changed, priority changed to High` |
| **Call Closed** | `✅ Call closed by DispatcherName` |
| **Unit Attached** | `🚔 Unit K-9 (10-8) attached to call` |
| **Unit Detached** | `🚔 Unit K-9 detached from call` |
| **Bodycam Activated** | `📹 Bodycam activated by OfficerName (recording #42)` |
| **Bodycam Requested** | `📹 Bodycam #42 requested by supervisor SupervisorName` |

### 17.2 Viewing Call Notes

1. In any CAD interface, open a call to view its details.
2. The **Notes** section shows all notes for that call, ordered by time.
3. Each note shows: the **type** (system, bodycam, etc.), the **message**, the **author**, and the **timestamp**.

### 17.3 Viewing Notes via API

Call notes are also accessible via the API at `GET /call-notes/:callId` for integration with external tools.

---

## 18. Discord Bot

The **Discord Bot** is a standalone Node.js process that adds slash commands and role-syncing capabilities to your CAD server. It communicates with the main CAD server via internal API endpoints protected by a shared secret.

### 18.1 Architecture

The bot runs as a **separate process** (not bolted onto `server.js`) because discord.js's Gateway connection is long-lived and stateful. This keeps the main Express app's dependency tree clean and avoids restarts during development.

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

### 18.2 Slash Commands

| Command | Description | Who Can See It |
|---|---|---|
| `/link` | Check if your Discord account is linked to a CAD user | Only you (ephemeral) |
| `/units` | Show all currently active (clocked-in) CAD units on this server | Everyone |
| `/dept-role-sync` | Preview department members and their ranks for role mapping | Only you (ephemeral) |

### 18.3 Setup for Server Owners

The Discord Bot needs to be set up by your server administrator (see the README for full deployment instructions). As a server owner, you just need to:

1. **Link your Discord guild** — Set the **Discord Server ID** in Server Settings to match your Discord server.
2. **Shared secret** — The administrator configures `DISCORD_BOT_SECRET` on both the CAD server and the bot.
3. **Invite the bot** — Use the invite URL generated by the deploy script (includes both `bot` and `applications.commands` scopes).

Once set up, members can use the `/link` command to verify their CAD account is linked, and `/units` to see who's on duty.

### 18.4 Security

- All bot API requests are authenticated via the `x-bot-secret` header matching `DISCORD_BOT_SECRET`.
- The bot never has direct database access — it only reads data through controlled API endpoints.
- `/link` and `/dept-role-sync` responses are ephemeral (visible only to the command user).

---

## 19. Alert Sounds System

Ultimate CAD includes an **Alert Sounds** system that plays audio notifications for important events. Sounds are generated by the Web Audio API by default, with support for custom audio files.

### 19.1 Event Sounds

| Event | Sound Description | Default Tone |
|---|---|---|
| **New Call Created** | Played when a new active call appears | Two rising square-wave tones 🔔🔔 |
| **Attached to Call** | Played when you attach to a call | Three ascending sine chimes 🎵🎵🎵 |
| **Call Updated** | Played when an attached call is updated | Single short triangle tone 🔔 |
| **New BOLO** | Played when a new BOLO is broadcast | Three descending sawtooth tones 🔊🔊🔊 |

### 19.2 Which Pages Play Which Sounds

| Sound | Dispatcher | LEO | F&R | DOT |
|---|---|---|---|---|
| New Call | ✅ | ✅ | ✅ | ✅ |
| Attached to Call | ✅ | ✅ | ✅ | ✅ |
| Call Updated | ✅ | ✅ | ✅ | ✅ |
| New BOLO | ✅ | ✅ | ❌ | ❌ |

### 19.3 Toggling Sounds

All sounds are **enabled by default**. You can disable individual sounds from the browser console:

```js
// Disable new call sound
AlertSounds.setEnabled(AlertSounds.types.NEW_CALL, false);

// Re-enable BOLO sound
AlertSounds.setEnabled(AlertSounds.types.NEW_BOLO, true);

// Check if a sound is enabled
AlertSounds.isEnabled(AlertSounds.types.CALL_ATTACHED); // true/false
```

### 19.4 Custom Audio Files

You can replace the default generated tones with your own audio files (MP3, WAV, OGG). To set custom sounds:

1. Upload your audio files to a reachable URL (or place them in the `public/audio/` directory).
2. Use the browser console to set each sound type:

```js
AlertSounds.setCustomAudio(AlertSounds.types.NEW_CALL, '/audio/my-new-call.mp3');
AlertSounds.setCustomAudio(AlertSounds.types.CALL_ATTACHED, '/audio/my-attached.mp3');
AlertSounds.setCustomAudio(AlertSounds.types.CALL_UPDATED, '/audio/my-updated.mp3');
AlertSounds.setCustomAudio(AlertSounds.types.NEW_BOLO, '/audio/my-bolo.mp3');
```

3. Pass `null` to clear a custom URL and revert to the generated tone:

```js
AlertSounds.setCustomAudio(AlertSounds.types.NEW_CALL, null);
```

Your custom audio settings are saved in your browser's localStorage and persist across sessions.

---

## 20. Status Codes (10-Codes)

The following 10-codes are used across all CAD interfaces for unit status:

| Code | Full Meaning | When to Use |
|---|---|---|
| **10-8** | In Service / Available | You are ready to receive calls |
| **10-7** | Out of Service / Off Duty | You are ending your shift or unavailable |
| **10-97** | On Scene | You have arrived at the call location |
| **10-23** | Arrived at Location | You have reached the specified location |
| **10-6** | Busy | You are occupied but still in service |

> All status codes are send as push-to-set — clicking any status button immediately updates your status to that code.

---

## 21. Glossary

| Term | Definition |
|---|---|
| **CAD** | Computer-Aided Dispatch — the core system for managing emergency calls and units |
| **BOLO** | Be On the LookOut — an alert broadcast to all units about a person, vehicle, or item of interest |
| **CODE 4** | Radio code meaning "scene is safe, no further assistance needed" — used to close calls |
| **10-Code** | Standardized radio codes used by emergency services (e.g., 10-8 = Available) |
| **Unit** | An officer/firefighter/dispatcher who is clocked into the CAD |
| **Clock In** | The action of signing into the CAD for a shift |
| **Clock Out** | The action of ending a shift and exiting the CAD |
| **Self-Dispatch** | When a unit assigns themselves to a call without being dispatched |
| **LEO** | Law Enforcement Officer |
| **F&R (FR)** | Fire & Rescue |
| **DOT** | Department of Transportation |
| **ERLC** | Emergency Response: Liberty County (Roblox game) |
| **Bodycam** | Video recording system using desktop capture, linked to CAD calls |
| **WebRTC** | Web Real-Time Communication — used for peer-to-peer voice radio |
| **Signaling** | WebSocket-based coordination for establishing WebRTC connections |
| **Call Note** | Auto-generated log entry documenting events on a call |
| **Push-to-Talk (PTT)** | Voice activation mode where you hold a key to transmit |
| **OAuth** | Open Authorization — used for Discord and Roblox login |
| **JWT** | JSON Web Token — used for API session authentication |
| **AES-256-GCM** | Advanced Encryption Standard — used for encrypting ERLC server keys |
| **HR_ACCESS** | Human Resources permission — full department management access |
| **SUPERVISOR** | Department role that can approve warrants and view reports |
| **SOP** | Standard Operating Procedure |
| **Server Key** | ERLC API key used to connect to a game server |
| **Temp Character** | Auto-generated player profile with random name, license, and vehicle |
| **Audit Log** | Record of important server events (kicks, calls, reports) |

---

## 22. FAQ & Troubleshooting

### Q: I can't log in. What should I do?

Make sure you have a valid Discord account. Try logging out of Discord in your browser and clicking "Login with Discord" again. If the issue persists, check with your server administrator.

### Q: I clocked in but I don't see any calls.

Calls must be created by a dispatcher or another unit. If ERLC integration is configured, 911 calls from the game will also appear. Check that you're on the **CAD** panel.

### Q: Why don't I see myself on the map?

For your unit to appear on the CAD map:
1. Your **Roblox account must be linked** in Settings.
2. You must be **in-game** on the ERLC server with the same Roblox username.
3. The server must have a valid **ERLC key configured**.

### Q: How do I assign myself to a call?

In the CAD panel, click the **"Attach"** button on any active call. Your callsign will appear in the call's "Unit" column. Click **"Detach"** to remove yourself.

### Q: I'm a dispatcher but I can't see all units.

You should see all clocked-in units across all agencies. If someone is missing, they may not be clocked in, or their department may not have any active members.

### Q: How do I close a call?

Click the **"CODE 4"** button on the active call. This marks the call as closed and releases all attached units.

### Q: I set up ERLC but nothing is showing.

1. Verify your ERLC server key by clicking **"Test"** in Server Settings.
2. Make sure your ERLC server is online.
3. Check the status bar on the CAD Map — it will show if ERLC is connected.

### Q: What happens when I delete a server?

All data is permanently deleted — calls, BOLOs, reports, members, departments, everything. A verification code is sent to your email and you must type the server name to confirm.

### Q: I forgot my login information.

Ultimate CAD uses Discord OAuth — there is no separate password. Simply click **"Login with Discord"** and re-authorize. If your Discord account is compromised, secure it first through Discord.

### Q: Can I use the same account on multiple devices?

Yes. Your session is stored as a JWT token. You can log in from multiple devices simultaneously. Manage your sessions in **Settings → Security** section and revoke any sessions you don't recognize.

### Q: The sounds aren't working.

- Check that your browser allows audio autoplay.
- Open your browser console and check if sounds are enabled:
  ```js
  AlertSounds.isEnabled(AlertSounds.types.NEW_CALL); // should return true
  ```
- Re-enable all sounds:
  ```js
  Object.values(AlertSounds.types).forEach(t => AlertSounds.setEnabled(t, true));
  ```

### Q: How do I use bodycam?

You need the **Electron desktop app**. Once installed:
1. Set your bodycam keybind in Account Settings (default F2).
2. Clock in as a unit.
3. Press the keybind to start recording.
4. Press it again to stop.
5. If a supervisor requests your footage, you'll see a notification on next clock-in.

### Q: How do I use the voice radio?

1. Clock in to the CAD.
2. Open the **Radio** panel.
3. Click **Connect** to join your department's voice channel.
4. Grant microphone access when prompted.
5. Use the **Push-to-Talk** button to transmit.

### Q: What are call notes?

Call notes are auto-generated logs that track everything that happens on a call — when it was created, updated, closed, when units attach/detach, and when bodycams are activated. They provide a complete audit trail for each call.

### Q: What is the Discord bot and how do I use it?

The Discord bot adds slash commands (`/link`, `/units`, `/dept-role-sync`) to your Discord server. It needs to be set up by your server administrator. Once running, any member can use `/link` to check their CAD account connection, and `/units` to see who's on duty.

### Q: I'm an owner and need to transfer ownership.

This feature is not yet available in the UI. Contact your server administrator or the CAD developer for assistance.

---

## Appendix: Roles & Permissions Summary

### Server-Level Roles

| Role | Privileges |
|---|---|
| **Owner** | Full access to Server Settings, member management, server deletion, all department controls |
| **Admin** | Access to Server Settings (view/edit), member management (change roles, kick) |
| **Moderator** | Limited member management |
| **Member** | Can clock in, use CAD interfaces, file reports, access civilian records |

### Department-Level Permissions

| Permission | Privileges |
|---|---|
| **HR_ACCESS** | Manage department settings, employees, ranks, roles, vehicles, documents, give infractions |
| **SUPERVISOR** | Approve warrants (LEO), read reports, access Supervisor Panel |
| **MANAGE_ROLES** | Assign additional roles to department members |

---

*This manual was generated for **Ultimate CAD**. For additional support or feature requests, please contact your server administrator or visit the documentation site.*

*© 2026 Ultimate CAD — Built for the Roblox roleplay community.*

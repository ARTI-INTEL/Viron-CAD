const { app, BrowserWindow, shell, session, Menu, globalShortcut } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const bodycamRecorder = require('./bodycam-recorder.js');
const fs   = require('fs');

// Point this at your deployed Ultimate CAD instance.
// Swap for a local URL (e.g. http://localhost:3000) during dev
// if you're running `npm run dev` from the project root.
const CAD_URL = process.env.CAD_URL || 'http://localhost:5500';

let mainWindow;

// ── Auto-update configuration ────────────────────────────────────────────────
//
// By default, electron-updater checks for releases on your GitHub repository.
// Configure the repo owner/name in package.json's "build.publish".
//
// To disable auto-updates during development, set:
//   $env:CAD_DEV="1"; npm start
//
// The updater silently downloads the new version in the background and installs
// it the next time the user quits the app.

const isDev = process.env.CAD_DEV === '1';

function setupAutoUpdater() {
  if (isDev) {
    console.log('[AutoUpdater] Skipped — dev mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  // Log what's happening (visible in DevTools console on the main process)
  autoUpdater.logger = {
    info:  (msg) => console.log('[AutoUpdater]', msg),
    warn:  (msg) => console.warn('[AutoUpdater]', msg),
    error: (msg) => console.error('[AutoUpdater]', msg),
  };

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    // Optionally notify via a small dialog or tray balloon
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        `typeof Toast !== 'undefined' && Toast.info('A new version (${info.version}) is downloading…')`
      ).catch(() => {});
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] No update available');
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`[AutoUpdater] Downloaded ${pct}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    // Show a notification that it'll install on quit
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(
        `typeof Toast !== 'undefined' && Toast.success('Update ${info.version} ready — will install on quit')`
      ).catch(() => {});
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
  });

  // Check for updates (non-blocking — doesn't delay window creation)
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[AutoUpdater] Check failed:', err.message);
  });
}

// ── Bodycam keybind config path (persisted per user) ────────────
const KEYBIND_PATH = path.join(app.getPath('userData'), 'bodycam-keybind.json');

function loadBodycamKeybind() {
  try {
    var raw = fs.readFileSync(KEYBIND_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return { key: 'F2' };
  }
}

function saveBodycamKeybind(key) {
  try {
    fs.writeFileSync(KEYBIND_PATH, JSON.stringify({ key: key }));
  } catch (_) {}
}

function registerBodycamShortcut(key) {
  globalShortcut.unregisterAll();
  if (!key) return;
  try {
    globalShortcut.register(key, function () {
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(
          `typeof BodycamUI !== 'undefined' && (BodycamUI._recording ? BodycamUI.stopBodycam() : BodycamUI.startBodycam())`
        ).catch(function () {});
      }
    });
  } catch (_) {}
}

// ── Window creation ──────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(CAD_URL);

  // Open Discord OAuth / external links (docs, privacy, ToS) in the
  // system browser instead of inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(CAD_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  // radio.js requests navigator.mediaDevices.getUserMedia({ audio: true })
  // for the PTT widget — Electron blocks mic access by default, so grant it
  // explicitly for your own origin.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') return callback(true);
    callback(false);
  });

  Menu.setApplicationMenu(null); // remove default File/Edit/View menu bar
  createWindow();
  setupAutoUpdater();

  // Initialise bodycam recorder (handles IPC from renderer)
  bodycamRecorder.init(mainWindow);

  // Load and register saved bodycam keybind
  var savedBind = loadBodycamKeybind();
  registerBodycamShortcut(savedBind.key);

  // IPC handlers for bodycam keybind settings
  const { ipcMain } = require('electron');
  
  ipcMain.handle('bodycam:get-keybind', function () {
    return loadBodycamKeybind();
  });

  ipcMain.handle('bodycam:set-keybind', function (event, key) {
    saveBodycamKeybind(key);
    registerBodycamShortcut(key);
    return { success: true };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', function () {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

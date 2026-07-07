/**
 * bodycam-recorder.js  Ultimate CAD Electron – Bodycam Recorder
 *
 * Uses a hidden BrowserWindow (renderer) to run MediaRecorder with
 * desktop capture. Main process handles window selection and file I/O.
 *
 * Fixed: loads about:blank + executeJavaScript instead of broken data URI.
 */

const { ipcMain, desktopCapturer, BrowserWindow } = require('electron');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const RECORDINGS_DIR = path.join(os.homedir(), 'UltimateCAD', 'Bodycam');
try { fs.mkdirSync(RECORDINGS_DIR, { recursive: true }); } catch (_) {}

let recordingWindow = null;   // hidden BrowserWindow running MediaRecorder
let currentFilePath = null;
let _hiddenWcId = null;       // webContents ID for filtering IPC

/* ── Register IPC handlers ─────────────────────────────────── */
function init(mainWindow) {
  // ── List available windows (for settings page) ──────────────
  ipcMain.handle('bodycam:list-windows', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['window'] });
      return sources.map(function (s) {
        return { id: s.id, name: s.name, thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null };
      });
    } catch (err) {
      return [];
    }
  });

  // ── Start recording ─────────────────────────────────────────
  ipcMain.handle('bodycam:start', async (event, { serverId, callId, unitId, userId, fileName }) => {
    try {
      if (recordingWindow && !recordingWindow.isDestroyed()) {
        recordingWindow.close();
        recordingWindow = null;
      }

      const sources = await desktopCapturer.getSources({ types: ['window'] });

      // Try to find the user's preferred target window
      var targetName = event.sender ? null : null;
      let target = sources.find(function (s) {
        return s.name.toLowerCase().includes('roblox');
      });

      // Fallback: first window with a name (skip empty/desktop)
      if (!target) {
        target = sources.find(function (s) {
          return s.name && s.name !== '' && !s.name.includes('Ultimate CAD');
        });
      }

      // Last resort: any window
      if (!target) {
        target = sources[0];
      }

      if (!target) throw new Error('No captureable window found');

      const filePath = path.join(RECORDINGS_DIR, fileName || ('bodycam_' + Date.now() + '.webm'));
      currentFilePath = filePath;

      recordingWindow = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
      });

      _hiddenWcId = recordingWindow.webContents.id;

      // Load about:blank first, then inject the recording script
      await recordingWindow.loadURL('about:blank');

      // The recording script uses require('electron') because nodeIntegration is true
      const script = `
        (async function() {
          const { ipcRenderer } = require('electron');
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: '${target.id}' } }
            });

            var chunks = [];
            var mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
              ? 'video/webm;codecs=vp9' : 'video/webm';
            var recorder = new MediaRecorder(stream, { mimeType: mime });

            recorder.ondataavailable = function(e) {
              if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = function() {
              stream.getTracks().forEach(function(t) { t.stop(); });
              var blob = new Blob(chunks, { type: 'video/webm' });
              blob.arrayBuffer().then(function(buf) {
                ipcRenderer.send('bc:data', Buffer.from(buf));
              });
            };

            recorder.start(1000);
            ipcRenderer.send('bc:ready');

            ipcRenderer.on('bc:stop', function() {
              if (recorder.state !== 'inactive') recorder.stop();
            });
          } catch(e) {
            ipcRenderer.send('bc:error', e.message);
          }
        })();
      `;

      recordingWindow.webContents.executeJavaScript(script);

      return new Promise(function (resolve, reject) {
        var timeoutId = setTimeout(function () {
          reject(new Error('Recording window failed to initialise'));
        }, 10000);

        var bcReady = function (evt, msg) {
          if (evt.sender.id !== _hiddenWcId) return;
          clearTimeout(timeoutId);
          ipcMain.removeListener('bc:ready', bcReady);
          resolve({ id: fileName || path.basename(filePath), fileName: fileName || path.basename(filePath), filePath: filePath });
        };

        var bcError = function (evt, msg) {
          if (evt.sender.id !== _hiddenWcId) return;
          clearTimeout(timeoutId);
          ipcMain.removeListener('bc:ready', bcReady);
          ipcMain.removeListener('bc:error', bcError);
          reject(new Error(msg));
        };

        ipcMain.on('bc:ready', bcReady);
        ipcMain.on('bc:error', bcError);
      });
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Stop recording ──────────────────────────────────────────
  ipcMain.handle('bodycam:stop', async () => {
    if (recordingWindow && !recordingWindow.isDestroyed()) {
      recordingWindow.webContents.send('bc:stop');
      // Wait briefly for final data then close
      await new Promise(function (r) { setTimeout(r, 1500); });
      if (recordingWindow && !recordingWindow.isDestroyed()) {
        recordingWindow.close();
      }
      recordingWindow = null;
      _hiddenWcId = null;
    }
    return { success: true, filePath: currentFilePath };
  });

  // ── Status check ────────────────────────────────────────────
  ipcMain.handle('bodycam:status', () => {
    return { active: recordingWindow !== null && !recordingWindow.isDestroyed() };
  });

  // ── Handle recorded data from the hidden window ─────────────
  ipcMain.on('bc:data', function (evt, buf) {
    if (currentFilePath) {
      try {
        fs.writeFileSync(currentFilePath, Buffer.from(buf));
      } catch (_) {}
    }
  });

  // Clean up on app quit
  mainWindow.on('closed', function () {
    if (recordingWindow && !recordingWindow.isDestroyed()) {
      recordingWindow.close();
      recordingWindow = null;
    }
  });
}

module.exports = { init };

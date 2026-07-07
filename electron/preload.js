/**
 * preload.js  Ultimate CAD Desktop – Preload Script
 *
 * Exposes a minimal IPC bridge for bodycam recording and window
 * selection to the renderer process via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__electronBodycam', {
  start: function (metadata) {
    return ipcRenderer.invoke('bodycam:start', metadata);
  },
  stop: function (recordingId) {
    return ipcRenderer.invoke('bodycam:stop', recordingId);
  },
  getStatus: function () {
    return ipcRenderer.invoke('bodycam:status');
  },
  listWindows: function () {
    return ipcRenderer.invoke('bodycam:list-windows');
  },
  getKeybind: function () {
    return ipcRenderer.invoke('bodycam:get-keybind');
  },
  setKeybind: function (key) {
    return ipcRenderer.invoke('bodycam:set-keybind', key);
  },
});

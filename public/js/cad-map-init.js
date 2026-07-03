
/**
 * cad-map-init.js (FIXED + DEBUG)
 * Reliable map auto-initialiser for all department CADs
 */

(function () {
  'use strict';

  console.log('[CadMapInit] Script loaded');

  /* ── Detect which CAD page we are on ─────────────────────── */
  var containerMap = {
    'leo-map-container': 'btn-map',     // LEO
    'fr-map-container':  'fr-nav-map',  // Fire & Rescue
    'dot-map-container': 'dot-nav-map', // DOT
    'd-map-container':   'btn-map',     // Dispatcher (skip)
  };

  var containerId = null;

  Object.keys(containerMap).forEach(function (id) {
    if (document.getElementById(id)) {
      containerId = id;
    }
  });

  console.log('[CadMapInit] Detected container:', containerId);

  /* Skip dispatcher (it handles its own map) */
  if (!containerId || containerId === 'd-map-container') {
    console.log('[CadMapInit] Skipping init (dispatcher or no container)');
    return;
  }

  var userId = null;
  var serverId = null;

  try { userId = localStorage.getItem('cad_user_id'); } catch (_) {}
  try { serverId = localStorage.getItem('cad_active_server'); } catch (_) {}

  console.log('[CadMapInit] userId:', userId, 'serverId:', serverId);

  if (!userId || !serverId) {
    console.warn('[CadMapInit] Missing userId or serverId');
    return;
  }

  if (typeof CadMap === 'undefined') {
    console.error('[CadMapInit] CadMap is not loaded!');
    return;
  }

  var _map = null;

  /* ── Safe init with retry ────────────────────────────────── */
  function initMapWhenReady() {
    var el = document.getElementById(containerId);

    if (!el) {
      console.warn('[CadMapInit] Container not found, retrying...');
      return setTimeout(initMapWhenReady, 100);
    }

    var width = el.clientWidth;
    var height = el.clientHeight;

    console.log('[CadMapInit] Container size:', width, height);

    if (width === 0 || height === 0) {
      console.warn('[CadMapInit] Container not visible yet, retrying...');
      return setTimeout(initMapWhenReady, 120);
    }

    if (!_map) {
      console.log('[CadMapInit] Initialising map...');
      _map = new CadMap({
        containerId: containerId,
        serverId: serverId,
        userId: userId,
        pollInterval: 8000,
      });
    }

    /* Force resize AFTER visible */
    setTimeout(function () {
      if (_map && typeof _map._resize === 'function') {
        console.log('[CadMapInit] Forcing resize');
        _map._resize();
      }
    }, 100);
  }

  /* ── Hook into map nav button ───────────────────────────── */
  var navBtnId = containerMap[containerId];
  var navBtn = document.getElementById(navBtnId);

  if (!navBtn) {
    console.error('[CadMapInit] Nav button not found:', navBtnId);
    return;
  }

  console.log('[CadMapInit] Hooking button:', navBtnId);

  navBtn.addEventListener('click', function () {
    console.log('[CadMapInit] Map button clicked');

    /* Delay to allow panel animation/display */
    setTimeout(function () {
      initMapWhenReady();
    }, 120);
  }, false);

})();

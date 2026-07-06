
/**
 * cad-map-init.js (FIXED + DEBUG)
 * Reliable map auto-initialiser for all department CADs
 */

(function () {
  'use strict';

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

  /* Skip dispatcher (it handles its own map) */
  if (!containerId || containerId === 'd-map-container') {
    return;
  }

  var userId = null;
  var serverId = null;

  try { userId = localStorage.getItem('cad_user_id'); } catch (_) {}
  try { serverId = localStorage.getItem('cad_active_server'); } catch (_) {}

  if (!userId || !serverId) {
    return;
  }

  if (typeof CadMap === 'undefined') {
    // CadMap not loaded — skip
    return;
  }

  var _map = null;

  /* ── Safe init with retry ────────────────────────────────── */
  function initMapWhenReady() {
    var el = document.getElementById(containerId);

    if (!el) {
      return setTimeout(initMapWhenReady, 100);
    }

    var width = el.clientWidth;
    var height = el.clientHeight;

    if (width === 0 || height === 0) {
      return setTimeout(initMapWhenReady, 120);
    }

    if (!_map) {
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
        _map._resize();
      }
    }, 100);
  }

  /* ── Hook into map nav button ───────────────────────────── */
  var navBtnId = containerMap[containerId];
  var navBtn = document.getElementById(navBtnId);

  if (!navBtn) {
    return;
  }

  navBtn.addEventListener('click', function () {

    /* Delay to allow panel animation/display */
    setTimeout(function () {
      initMapWhenReady();
    }, 120);
  }, false);

})();

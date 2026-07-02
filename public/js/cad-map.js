/**
 * cad-map.js  Ultimate CAD – ERLC Live Map Component
 *
 * Canvas-based live map that plots ERLC player positions, CAD unit
 * markers, and active call pins. Works in all CAD pages.
 *
 * Usage:
 *   var map = new CadMap({
 *     containerId : 'cad-map-container',   // element to render into
 *     serverId    : '123',
 *     userId      : '456',
 *     pollInterval: 8000,                  // ms between ERLC fetches
 *   });
 *   map.destroy(); // stop polling + remove canvas
 */

(function (global) {
  'use strict';

  /* ── Liberty County ERLC coordinate bounds (Roblox studs) ── */
  // Top-left origin coordinate system. (0,0) is the top-left corner of the
  // map image. X increases eastward (right), Z increases southward (down).
  // Incoming ERLC data uses center-origin and is shifted by +3200.
  var BOUNDS = { minX: 0, maxX: 6400, minZ: 0, maxZ: 6400 };

  /* ── Known Liberty County landmark positions for call pinning ─ */
  // Top-left origin coordinates (center-origin shifted by +3200).
  var LC_LOCATIONS = [
    { names: ['spawn', 'garage', 'central garage'],                    x: 3200,  z: 3200   },
    { names: ['police', 'pd', 'police dept', 'police department', 'police station'], x: 3000,  z: 3300   },
    { names: ['fire', 'fire station', 'firedept', 'fire department', 'hospital', 'ems'],          x: 3500,  z: 2800   },
    { names: ['highway', 'freeway', 'interstate'],                     x: 4000,  z: 3800   },
    { names: ['airport', 'airfield'],                                  x: 1400,  z: 5000   },
    { names: ['beach', 'shore', 'coastal'],                            x: 5400,  z: 5600   },
    { names: ['downtown', 'city', 'city center', 'centre'],            x: 3100,  z: 3100   },
    { names: ['suburbs', 'residential'],                                x: 4100,  z: 4100   },
    { names: ['industrial', 'warehouse', 'factory'],                   x: 2000,  z: 2400   },
    { names: ['park', 'forest', 'woods'],                              x: 4800,  z: 1800   },
    { names: ['dock', 'port', 'harbor'],                               x: 6000,  z: 3200   },
    { names: ['mountain', 'hill', 'ridge'],                            x: 700,   z: 1200   },
    { names: ['gas station'],                                          x: 3600,  z: 3500   },
    { names: ['convenience', 'store', 'shop', 'mall'],                x: 2600,  z: 3700   },
    { names: ['school', 'university'],                                 x: 2200,  z: 4400   },
    { names: ['north'],                                                x: 3200,  z: 700    },
    { names: ['south'],                                                x: 3200,  z: 5700   },
    { names: ['east'],                                                 x: 5700,  z: 3200   },
    { names: ['west'],                                                 x: 700,   z: 3200   },
  ];

  /* ── Shift helper: center-origin → top-left origin ────────── */
  function shiftCoord(v) { return Number(v) + 3200; }

  /* ── Priority colour palette ──────────────────────────────── */
  var PRIORITY_COLOR = {
    Low: '#00ff2f', Medium: '#ffbb00', High: '#ff8800', Critical: '#ff0004'
  };

  /* ── Team → colour mapping ────────────────────────────────── */
  function teamColor(team) {
    var t = (team || '').toLowerCase();
    if (t.includes('police') || t.includes('sheriff') || t.includes('state patrol') || t.includes('leo'))
      return '#00b2ff';
    if (t.includes('fire') || t.includes('ems') || t.includes('rescue') || t.includes('medic'))
      return '#ff4444';
    if (t.includes('transport') || t.includes('dot') || t.includes('highway'))
      return '#ffbb00';
    if (t.includes('civilian'))
      return '#888888';
    return '#bbbbbb';
  }

  /* ── Fuzzy location → ERLC coordinates ───────────────────── */
  function locationToCoords(locationStr) {
    if (!locationStr) return null;
    var loc = locationStr.toLowerCase();

    // Parse explicit "(x, z)" or "x:123 z:-456" patterns if a user typed them
    var explicit = loc.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/);
    if (explicit) return { x: shiftCoord(parseFloat(explicit[1])), z: shiftCoord(parseFloat(explicit[2])) };

    // Fuzzy match known landmarks
    var best = null;
    var bestScore = 0;
    LC_LOCATIONS.forEach(function (lm) {
      lm.names.forEach(function (name) {
        if (loc.includes(name) && name.length > bestScore) {
          best = lm;
          bestScore = name.length;
        }
      });
    });
    return best ? { x: best.x + (Math.random() * 200 - 100), z: best.z + (Math.random() * 200 - 100) } : null;
  }

  /* ═══════════════════════════════════════════════════════════ */
  /*  CadMap constructor                                         */
  /* ═══════════════════════════════════════════════════════════ */ 
  function CadMap(options) {
    this.containerId   = options.containerId;
    this.serverId      = options.serverId;
    this.userId        = options.userId;
    this.pollInterval  = options.pollInterval || 8000;

    this.players = [];   // ERLC player list
    this.linked  = [];   // CAD units with ERLC position attached
    this.calls   = [];   // Active CAD calls (with optional coords)
    this.erlcCalls = []; // ERLC emergency 911 calls

    this._canvas     = null;
    this._ctx        = null;
    this._mapImage   = null;
    this._pollTimer  = null;
    this._animFrame  = null;
    this._mounted    = false;

    this._callCoordCache = {}; // cache resolved call coords by id

    this._resizeHandler = this._resize.bind(this);
    this._init();
  }

  CadMap.prototype._init = function () {
    var container = document.getElementById(this.containerId);
    if (!container) return;

    /* Remove any existing placeholder content */
    container.innerHTML = '';

    /* Outer wrapper fills the container */
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:100%;height:100%;background:#0d1b3e;overflow:hidden;';
    container.appendChild(wrapper);
    this._wrapper = wrapper;

    /* Canvas */
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    wrapper.appendChild(canvas);
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');

    /* Overlay: status bar */
    var statusBar = document.createElement('div');
    statusBar.id = this.containerId + '-status';
    statusBar.style.cssText = [
      'position:absolute;top:0.5rem;left:50%;transform:translateX(-50%);',
      'background:rgba(0,0,0,0.6);color:rgba(255,255,255,0.7);',
      'font-family:Inter,sans-serif;font-size:0.6875rem;font-weight:700;',
      'padding:0.25rem 0.75rem;border-radius:0.5rem;pointer-events:none;',
      'white-space:nowrap;',
    ].join('');
    statusBar.textContent = 'Connecting to ERLC…';
    wrapper.appendChild(statusBar);
    this._statusBar = statusBar;

    /* Overlay: loading spinner for first load */
    var spinner = document.createElement('div');
    spinner.style.cssText = [
      'position:absolute;inset:0;display:flex;flex-direction:column;',
      'align-items:center;justify-content:center;',
      'color:rgba(255,255,255,0.35);font-family:Inter,sans-serif;',
      'font-size:0.9375rem;font-weight:600;gap:0.5rem;pointer-events:none;',
    ].join('');
    spinner.innerHTML = '<div style="font-size:2.5rem;">🗺️</div><span>Loading live map…</span>';
    wrapper.appendChild(spinner);
    this._spinner = spinner;

    this._mounted = true;
    this._resize();
    window.addEventListener('resize', this._resizeHandler);
    if (typeof ResizeObserver !== 'undefined') {
      var self = this;
      this._resizeObserver = new ResizeObserver(function () { self._resize(); });
      this._resizeObserver.observe(wrapper);
    }

    this._tryLoadMapImage();
    this._poll();
  };

  CadMap.prototype._tryLoadMapImage = function () {
    var url = "images/erlc_map.png"; 
    if (!url) return;
    var img = new Image();
    var self = this;
    img.onload  = function () { self._mapImage = img; self._render(); };
    img.onerror = function () { self._mapImage = null; };
    img.src = url;
  };

  CadMap.prototype._resize = function () {
    if (!this._canvas || !this._wrapper) return;
    var w = this._wrapper.clientWidth  || 0;
    var h = this._wrapper.clientHeight || 0;

    // Skip resizing into a 0×0 buffer (panel still hidden). Without this guard
    // the canvas locks to the 600×400 fallback, which then gets stretched
    // (non-uniformly) to the real container size once it becomes visible —
    // that mismatch is what causes markers to render offset from the map.
    if (w === 0 || h === 0) return;

    this._canvas.width  = w;
    this._canvas.height = h;
    this._render();
  };

  CadMap.prototype._getMapRect = function () {
    if (!this._canvas) return null;
    var w = this._canvas.width || 0;
    var h = this._canvas.height || 0;
    if (!w || !h) return null;

    if (!this._mapImage) {
      return { x: 0, y: 0, width: w, height: h };
    }

    var img = this._mapImage;
    var scale = Math.min(w / img.width, h / img.height);
    var drawW = img.width * scale;
    var drawH = img.height * scale;

    return {
      x: (w - drawW) / 2,
      y: (h - drawH) / 2,
      width: drawW,
      height: drawH,
    };
  };

  /* ── Coordinate conversion ───────────────────────────────── */
  CadMap.prototype._cx = function (x) {
    var rect = this._getMapRect();
    var baseW = rect ? rect.width : (this._canvas ? this._canvas.width : 0);
    var baseX = rect ? rect.x : 0;
    // Top-left origin: x=0 → left edge, x=6400 → right edge.
    return baseX + ((x - BOUNDS.minX) / (BOUNDS.maxX - BOUNDS.minX)) * baseW;
  };
  CadMap.prototype._cz = function (z) {
    var rect = this._getMapRect();
    var baseH = rect ? rect.height : (this._canvas ? this._canvas.height : 0);
    var baseY = rect ? rect.y : 0;
    // Top-left origin: z=0 → top edge, z=6400 → bottom edge.
    return baseY + ((z - BOUNDS.minZ) / (BOUNDS.maxZ - BOUNDS.minZ)) * baseH;
  };

  /* ── Rendering ───────────────────────────────────────────── */
  CadMap.prototype._render = function () {
    var ctx = this._ctx;
    var w   = this._canvas.width;
    var h   = this._canvas.height;
    if (!ctx || !w || !h) return;

    ctx.clearRect(0, 0, w, h);

    var mapRect = this._getMapRect();
    if (this._mapImage && mapRect) {
      ctx.drawImage(this._mapImage, mapRect.x, mapRect.y, mapRect.width, mapRect.height);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, w, h);
    } else {
      this._drawBackground(ctx, w, h);
    }

    this._drawCallPins(ctx);
    this._drawPlayers(ctx);
    this._drawLegend(ctx, w, h);
    this._drawDebugOverlay(ctx, w, h, mapRect);
  };

  CadMap.prototype._drawDebugOverlay = function (ctx, w, h, mapRect) {
    if (!mapRect) return;
    // Draw a bright border around the map image rect
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
    ctx.setLineDash([]);

    // Label the map rect dimensions
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 12px Inter,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Map rect: ' + Math.round(mapRect.width) + 'x' + Math.round(mapRect.height) +
      '  Canvas: ' + w + 'x' + h +
      '  Origin(0,0) px=' + Math.round(this._cx(0)) + ',' + Math.round(this._cz(0)),
      mapRect.x + 4, mapRect.y + 14);

    // Mark the top-left origin (game coord 0,0)
    var ox = this._cx(0);
    var oy = this._cz(0);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox - 10, oy); ctx.lineTo(ox + 10, oy);
    ctx.moveTo(ox, oy - 10); ctx.lineTo(ox, oy + 10);
    ctx.stroke();

    // Label the corners of the game bounds
    ctx.fillStyle = 'rgba(255,255,0,0.8)';
    ctx.font = '10px Inter,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('(0,0)', ox, oy - 4);
    ctx.fillText('(6400,6400)', this._cx(6400), this._cz(6400) + 12);

    // Log to console
    console.log('[CAD-MAP DEBUG]', {
      canvas: { w: w, h: h },
      mapRect: { x: mapRect.x, y: mapRect.y, w: mapRect.width, h: mapRect.height },
      imgLoaded: !!this._mapImage,
      imgSize: this._mapImage ? { w: this._mapImage.width, h: this._mapImage.height } : null,
      originPx: { x: Math.round(ox), y: Math.round(oy) },
      players: this.players.length,
      linked: this.linked.length,
    });
  };

  CadMap.prototype._drawBackground = function (ctx, w, h) {
    /* Deep blue ocean-like background */
    var grad = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, w * 0.7);
    grad.addColorStop(0, '#122244');
    grad.addColorStop(1, '#060f22');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    /* Major grid */
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    var cols = 8, rows = 6;
    for (var c = 1; c < cols; c++) {
      var gx = (c / cols) * w;
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (var r = 1; r < rows; r++) {
      var gy = (r / rows) * h;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    /* Center axes (midpoint of the map = 3200,3200 in top-left origin) */
    var cx = this._cx(3200), cy = this._cz(3200);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    ctx.setLineDash([]);

    /* Compass rose */
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = 'bold 11px Inter,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', w / 2, 14);
    ctx.fillText('S', w / 2, h - 4);
    ctx.textAlign = 'left';
    ctx.fillText('W', 4, h / 2 + 4);
    ctx.textAlign = 'right';
    ctx.fillText('E', w - 2, h / 2 + 4);
    ctx.textAlign = 'left';
  };

  CadMap.prototype._drawCallPins = function (ctx) {
    var self = this;
    this.calls.forEach(function (call) {
      var coords = null;

      // Prefer real stored coordinates (set when a call originates from ERLC
      // via sync-calls / import-call). These are exact — no guessing needed.
      var hasRealPos = call.pos_x !== null && call.pos_x !== undefined &&
                        call.pos_z !== null && call.pos_z !== undefined;

      if (hasRealPos) {
        coords = { x: shiftCoord(Number(call.pos_x)), z: shiftCoord(Number(call.pos_z)) };
      } else {
        // Fallback: fuzzy-guess from the location text (only relevant for
        // manually-created CAD calls that have no GPS data attached).
        coords = self._callCoordCache[call.id];
        if (!coords) {
          coords = locationToCoords(call.location);
          if (coords) self._callCoordCache[call.id] = coords;
        }
      }

      if (!coords) return;

      var px = self._cx(coords.x);
      var py = self._cz(coords.z);
      var color = PRIORITY_COLOR[call.priority] || '#ffffff';

      /* Pin body */
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fillStyle = color + 'cc';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      /* Call ID label */
      ctx.fillStyle = '#000';
      ctx.font = 'bold 9px Inter,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(call.id), px, py + 3);
      ctx.textAlign = 'left';

      /* Nature label below */
      ctx.fillStyle = '#fff';
      ctx.font = '9px Inter,sans-serif';
      ctx.textAlign = 'center';
      var nature = (call.nature || '').substring(0, 14);
      ctx.fillText(nature, px, py + 19);
      ctx.textAlign = 'left';
    });
  };

  CadMap.prototype._drawPlayers = function (ctx) {
    var self = this;

    /* Draw all ERLC players as small dots */
    this.players.forEach(function (p) {
      if (!p.Position) return;
      var px = self._cx(shiftCoord(p.Position.x));
      var py = self._cz(shiftCoord(p.Position.z));
      var color = teamColor(p.Team);

      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = color + '99';
      ctx.fill();
    });

    /* Draw CAD units (linked to ERLC) as larger dots with labels */
    this.linked.forEach(function (unit) {
      if (!unit.position) return;
      var px = self._cx(shiftCoord(unit.position.x));
      var py = self._cz(shiftCoord(unit.position.z));
      var color = teamColor(unit.erlcPlayer ? unit.erlcPlayer.Team : '');

      /* Pulsing ring */
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.strokeStyle = color + '55';
      ctx.lineWidth = 3;
      ctx.stroke();

      /* Solid dot */
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      /* Callsign label */
      var label = (unit.callsign || unit.name || '').substring(0, 14);
      if (label) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        var lw = ctx.measureText(label).width + 6;
        ctx.fillRect(px + 7, py - 9, lw, 13);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Inter,sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, px + 10, py + 1);
      }
    });
  };

  CadMap.prototype._drawLegend = function (ctx, w, h) {
    var items = [
      { color: '#00b2ff', label: 'LEO' },
      { color: '#ff4444', label: 'Fire / EMS' },
      { color: '#ffbb00', label: 'DOT' },
      { color: '#888888', label: 'Civilian' },
    ];
    var padX = 8, padY = 8, lineH = 16;
    var boxH = items.length * lineH + 10;
    var boxW = 88;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(padX, h - padY - boxH, boxW, boxH, 4)
      : ctx.rect(padX, h - padY - boxH, boxW, boxH);
    ctx.fill();

    items.forEach(function (item, i) {
      var ly = h - padY - boxH + 7 + i * lineH;
      ctx.beginPath();
      ctx.arc(padX + 10, ly + 4, 4, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '9px Inter,sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, padX + 18, ly + 8);
    });

    /* Unit count */
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px Inter,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      this.players.length + ' online · ' + this.linked.filter(function (u) { return u.position; }).length + ' located',
      w - 6, h - 6
    );
    ctx.textAlign = 'left';
  };

  /* ── Polling ─────────────────────────────────────────────── */
  CadMap.prototype._poll = function () {
    var self = this;
    this._fetch();
    this._pollTimer = setInterval(function () { self._fetch(); }, this.pollInterval);
  };

  CadMap.prototype._fetch = function () {
    var self = this;
    var headers = { 'x-user-id': self.userId };

    /* ERLC live units (players + linked CAD units) */
    fetch('/erlc/' + self.serverId + '/live-units', { headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        self.players = data.players || [];
        self.linked  = data.linked  || [];
        if (self._spinner) self._spinner.style.display = 'none';
        self._setStatus(
          self.players.length
            ? (self.players.length + ' players online – ' + new Date().toLocaleTimeString())
            : 'ERLC connected – no players online'
        );
        self._render();
      })
      .catch(function () {
        self._setStatus('ERLC offline or key not configured');
      });

    /* Active CAD calls */
    fetch('/calls/' + self.serverId, { headers: headers })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (calls) {
        self.calls = calls || [];
        self._render();
      })
      .catch(function () {});
  };

  CadMap.prototype._setStatus = function (msg) {
    if (this._statusBar) this._statusBar.textContent = msg;
  };

  /* ── Public API ──────────────────────────────────────────── */

  /** Force an immediate data refresh */
  CadMap.prototype.refresh = function () { this._fetch(); };

  /** Returns the latest linked unit array for use in tables */
  CadMap.prototype.getLinkedUnits = function () { return this.linked; };

  /** Cleanly remove the map and stop polling */
  CadMap.prototype.destroy = function () {
    if (this._pollTimer)  clearInterval(this._pollTimer);
    if (this._animFrame)  cancelAnimationFrame(this._animFrame);
    if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
    window.removeEventListener('resize', this._resizeHandler);
    if (this._wrapper && this._wrapper.parentNode) {
      this._wrapper.parentNode.removeChild(this._wrapper);
    }
    this._mounted = false;
  };

  global.CadMap = CadMap;

}(window));
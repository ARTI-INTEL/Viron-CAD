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
 *     bounds      : { maxX: 8192, maxZ: 8192 }, // optional override, see below
 *     scale       : 10,                    // optional override, see below
 *   });
 *   map.destroy(); // stop polling + remove canvas
 *
 * ── COORDINATE SYSTEM ──────────────────────────────────────────
 * The ERLC API returns (0,0) as the TOP-LEFT corner of the map
 * image, not the center. DEFAULT_BOUNDS below reflects that:
 * minX/minZ are 0, and maxX/maxZ are the stud width/height of the
 * map image. To calibrate maxX/maxZ for your server:
 *   1. Stand at the far east edge of the map in-game, note
 *      Position.x from GET /erlc/:serverId/players.
 *   2. Stand at the far south edge, note Position.z.
 *   3. Set those as maxX / maxZ (pass via the `bounds` option, or
 *      edit DEFAULT_BOUNDS below to change the project-wide default).
 *
 * ── POSITION SCALE ─────────────────────────────────────────────
 * Every raw x/z coordinate (players, linked CAD units, and call
 * pins) is multiplied by DEFAULT_SCALE (10) before being projected
 * onto the canvas. Override per-instance with the `scale` option
 * if a particular server's coordinates need a different multiplier.
 * ─────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ── Liberty County ERLC coordinate bounds (Roblox studs) ──
     (0,0) = top-left of the map image. minX/minZ MUST stay 0.
     Tune maxX/maxZ to match your map image's real stud dimensions. */
  var DEFAULT_BOUNDS = { minX: 0, maxX: 8192, minZ: 0, maxZ: 8192 };

  /* ── Position scale multiplier applied to all raw coordinates
     before projection (players, linked units, call pins). ── */
  var DEFAULT_SCALE = 2.6;

  /* ── Known Liberty County landmark positions for call pinning ─
     These offsets were authored around a centered (0,0) space and
     are re-centered at runtime (see locationToCoords) so they still
     land in-frame under the top-left-origin coordinate system. */
  var LC_LOCATIONS = [
    { names: ['spawn', 'garage', 'central garage'], x: 0,     z: 0      },
    { names: ['police', 'pd', 'police dept', 'police department', 'police station'], x: -200,  z: 100    },
    { names: ['fire', 'fire station', 'firedept', 'fire department', 'hospital', 'ems'],          x: 300,   z: -400   },
    { names: ['highway', 'freeway', 'interstate'],              x: 800,   z: 600    },
    { names: ['airport', 'airfield'],                           x: -1800, z: 1800   },
    { names: ['beach', 'shore', 'coastal'],                    x: 2200,  z: 2400   },
    { names: ['downtown', 'city', 'city center', 'centre'],    x: -100,  z: -100   },
    { names: ['suburbs', 'residential'],                        x: 900,   z: 900    },
    { names: ['industrial', 'warehouse', 'factory'],           x: -1200, z: -800   },
    { names: ['park', 'forest', 'woods'],                      x: 1600,  z: -1400  },
    { names: ['dock', 'port', 'harbor'],                       x: 2800,  z: 0      },
    { names: ['mountain', 'hill', 'ridge'],                    x: -2500, z: -2000  },
    { names: ['gas station'],                                  x: 400,   z: 300    },
    { names: ['convenience', 'store', 'shop', 'mall'],        x: -600,  z: 500    },
    { names: ['school', 'university'],                         x: -1000, z: 1200   },
    { names: ['north'],                                        x: 0,     z: -2500  },
    { names: ['south'],                                        x: 0,     z: 2500   },
    { names: ['east'],                                         x: 2500,  z: 0      },
    { names: ['west'],                                         x: -2500, z: 0      },
  ];

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
  function locationToCoords(locationStr, bounds) {
    if (!locationStr) return null;
    var loc = locationStr.toLowerCase();

    // Parse explicit "(x, z)" or "x:123 z:-456" patterns if a user typed them
    var explicit = loc.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/);
    if (explicit) return { x: parseFloat(explicit[1]), z: parseFloat(explicit[2]) };

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
    if (!best) return null;

    var b = bounds || DEFAULT_BOUNDS;
    var centerX = (b.minX + b.maxX) / 2;
    var centerZ = (b.minZ + b.maxZ) / 2;
    return {
      x: centerX + best.x + (Math.random() * 200 - 100),
      z: centerZ + best.z + (Math.random() * 200 - 100),
    };
  }

  /* ═══════════════════════════════════════════════════════════ */
  /*  CadMap constructor                                         */
  /* ═══════════════════════════════════════════════════════════ */
  function CadMap(options) {
    this.containerId   = options.containerId;
    this.serverId      = options.serverId;
    this.userId        = options.userId;
    this.pollInterval  = options.pollInterval || 8000;

    /* Per-instance bounds override, e.g. { maxX: 6000, maxZ: 6000 }.
       Falls back to DEFAULT_BOUNDS (top-left origin) otherwise. */
    this.bounds = Object.assign({}, DEFAULT_BOUNDS, options.bounds || {});

    /* Per-instance scale override. Multiplies every raw x/z
       coordinate before it's projected onto the canvas. */
    this.scale = (typeof options.scale === 'number' && options.scale > 0)
      ? options.scale
      : DEFAULT_SCALE;

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

    /* ── Zoom & pan state ───────────────────────────────── */
    this._panX     = 0;    // pan offset X (screen pixels, from center)
    this._panY     = 0;    // pan offset Y (screen pixels, from center)
    this._zoom     = 1;    // zoom multiplier
    this._minZoom  = 1;
    this._maxZoom  = 8;
    this._isDragging   = false;
    this._dragStartX   = 0;
    this._dragStartY   = 0;
    this._dragPanX     = 0;
    this._dragPanY     = 0;

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

    /* Initial cursor state */
    canvas.style.cursor = 'default';

    /* Zoom controls (bottom-right) */
    this._addZoomControls(wrapper);

    /* Mouse & wheel handlers for zoom/pan */
    this._attachMouseHandlers(wrapper);

    this._mounted = true;
    this._resize();
    window.addEventListener('resize', this._resizeHandler);

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
    this._canvas.width  = this._wrapper.clientWidth  || 600;
    this._canvas.height = this._wrapper.clientHeight || 400;
    this._render();
  };

  /* ── Coordinate conversion ───────────────────────────────────
     (0,0) from the ERLC API is the TOP-LEFT of the map image, so
     minX/minZ (0) map directly to canvas (0,0) with no centering.
     Raw coordinates are multiplied by this.scale (default 10x)
     before being normalized against bounds. Results are clamped
     to the canvas so off-map / scaled-out positions never draw
     off-screen. */
  CadMap.prototype._cx = function (x) {
    var b = this.bounds;
    var scaledX = x * this.scale;
    var px = ((scaledX - b.minX) / (b.maxX - b.minX)) * this._canvas.width;
    return px;
  };
  CadMap.prototype._cz = function (z) {
    var b = this.bounds;
    var scaledZ = z * this.scale;
    var py = ((scaledZ - b.minZ) / (b.maxZ - b.minZ)) * this._canvas.height;
    return py;
  };

  /* ── Rendering ───────────────────────────────────────────── */
  CadMap.prototype._render = function () {
    var ctx = this._ctx;
    var w   = this._canvas.width;
    var h   = this._canvas.height;
    if (!ctx || !w || !h) return;

    ctx.clearRect(0, 0, w, h);

    /* Apply zoom & pan transform */
    ctx.save();
    ctx.translate(w / 2 + this._panX, h / 2 + this._panY);
    ctx.scale(this._zoom, this._zoom);
    ctx.translate(-w / 2, -h / 2);

    /* High-quality image rendering */
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (this._mapImage) {
      ctx.drawImage(this._mapImage, 0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, w, h);
    } else {
      this._drawBackground(ctx, w, h);
    }

    this._drawCallPins(ctx);
    this._drawPlayers(ctx);

    ctx.restore();

    /* Legend & UI drawn in screen space (unaffected by zoom/pan) */
    this._drawLegend(ctx, w, h);
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

      /* Prefer real GPS coordinates persisted at ingestion time
         (pos_x/pos_z columns added via ALTER TABLE) over the fuzzy
         landmark-matching fallback used for manually-created calls. */
      var rawX = call.pos_x != null ? call.pos_x : call.posX;
      var rawZ = call.pos_z != null ? call.pos_z : call.posZ;

      if (rawX != null && rawZ != null && rawX !== '' && rawZ !== '') {
        coords = { x: Number(rawX), z: Number(rawZ) };
      } else {
        coords = self._callCoordCache[call.id];
        if (!coords) {
          coords = locationToCoords(call.location, self.bounds);
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
      var px = self._cx(p.Position.x);
      var py = self._cz(p.Position.z);
      var color = teamColor(p.Team);

      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = color + '99';
      ctx.fill();
    });

    /* Draw CAD units (linked to ERLC) as larger dots with labels */
    this.linked.forEach(function (unit) {
      if (!unit.position) return;
      var px = self._cx(unit.position.x);
      var py = self._cz(unit.position.z);
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

  /* ── Zoom controls (bottom-right buttons) ───────────────── */
  CadMap.prototype._addZoomControls = function (wrapper) {
    var container = document.createElement('div');
    container.style.cssText = [
      'position:absolute;bottom:3rem;right:0.75rem;',
      'display:flex;flex-direction:column;gap:0.25rem;',
      'z-index:10;pointer-events:none;',
    ].join('');

    var self = this;
    var btnStyle = [
      'width:2rem;height:2rem;border-radius:0.375rem;border:none;',
      'background:rgba(0,0,0,0.65);color:#fff;',
      'font-size:1.25rem;font-weight:700;cursor:pointer;',
      'font-family:Inter,sans-serif;pointer-events:auto;',
      'display:flex;align-items:center;justify-content:center;',
      'transition:background 0.15s;',
    ].join('');

    var zoomIn = document.createElement('button');
    zoomIn.textContent = '+';
    zoomIn.style.cssText = btnStyle;
    zoomIn.title = 'Zoom in';
    zoomIn.onclick = function () { self._adjustZoom(1.4); };

    var zoomOut = document.createElement('button');
    zoomOut.textContent = '\u2212';
    zoomOut.style.cssText = btnStyle;
    zoomOut.title = 'Zoom out';
    zoomOut.onclick = function () { self._adjustZoom(1 / 1.4); };

    var zoomReset = document.createElement('button');
    zoomReset.textContent = '\u21BA';
    zoomReset.style.cssText = btnStyle + 'font-size:1rem;';
    zoomReset.title = 'Reset zoom';
    zoomReset.onclick = function () {
      self._panX = 0;
      self._panY = 0;
      self._zoom = 1;
      self._render();
    };

    container.appendChild(zoomIn);
    container.appendChild(zoomOut);
    container.appendChild(zoomReset);
    wrapper.appendChild(container);
  };

  /* ── Mouse & wheel event handlers ───────────────────────── */
  CadMap.prototype._attachMouseHandlers = function (wrapper) {
    var self = this;

    wrapper.addEventListener('wheel', function (e) { self._onWheel(e); }, { passive: false });

    wrapper.addEventListener('mousedown', function (e) { self._onMouseDown(e); });
    wrapper.addEventListener('mousemove', function (e) { self._onMouseMove(e); });
    wrapper.addEventListener('mouseup',   function (e) { self._onMouseUp(e); });
    wrapper.addEventListener('mouseleave', function (e) { self._onMouseUp(e); });
  };

  CadMap.prototype._onWheel = function (e) {
    e.preventDefault();
    var rect = this._canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
    this._adjustZoom(factor, mx, my);
  };

  CadMap.prototype._onMouseDown = function (e) {
    /* Only start drag on left button */
    if (e.button !== 0) return;
    e.preventDefault();
    this._isDragging = true;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragPanX = this._panX;
    this._dragPanY = this._panY;
    this._canvas.style.cursor = 'grabbing';
  };

  CadMap.prototype._onMouseMove = function (e) {
    if (!this._isDragging) {
      this._canvas.style.cursor = this._zoom > 1 ? 'grab' : 'default';
      return;
    }
    e.preventDefault();
    this._panX = this._dragPanX + (e.clientX - this._dragStartX);
    this._panY = this._dragPanY + (e.clientY - this._dragStartY);
    this._render();
  };

  CadMap.prototype._onMouseUp = function (_e) {
    this._isDragging = false;
    this._canvas.style.cursor = this._zoom > 1 ? 'grab' : 'default';
  };

  /* ── Zoom with optional cursor anchoring ─────────────────── */
  CadMap.prototype._adjustZoom = function (factor, cx, cy) {
    var newZoom = Math.max(this._minZoom, Math.min(this._maxZoom, this._zoom * factor));
    if (newZoom === this._zoom) return;

    if (cx != null && cy != null) {
      /* Zoom toward cursor so the world point under the mouse stays put */
      var w = this._canvas.width;
      var h = this._canvas.height;
      var worldX = (cx - w / 2 - this._panX) / this._zoom + w / 2;
      var worldY = (cy - h / 2 - this._panY) / this._zoom + h / 2;
      this._panX = cx - (worldX - w / 2) * newZoom - w / 2;
      this._panY = cy - (worldY - h / 2) * newZoom - h / 2;
    }

    this._zoom = newZoom;
    this._canvas.style.cursor = newZoom > 1 ? 'grab' : 'default';
    this._render();
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
    window.removeEventListener('resize', this._resizeHandler);
    if (this._wrapper && this._wrapper.parentNode) {
      this._wrapper.parentNode.removeChild(this._wrapper);
    }
    this._mounted = false;
  };

  global.CadMap = CadMap;

}(window));
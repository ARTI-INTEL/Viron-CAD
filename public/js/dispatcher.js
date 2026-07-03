/**
 * dispatcher.js  Ultimate CAD Dispatcher
 *
 * Full API integration: calls, BOLOs, active units (with live ERLC locations),
 * ERLC in-game emergency call import, ERLC live map, search, history.
 * Polls live data every 10 seconds; ERLC data every 8 seconds.
 */

(function () {
  'use strict';

  const API_BASE = '';

  function get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }

  const userId   = get('cad_user_id');
  const serverId = get('cad_active_server');
  const unitId   = get('cad_unit_id');

  if (!userId || !serverId) { window.location.href = 'server-page.html'; return; }

  const authHeaders = { 'Content-Type': 'application/json', 'x-user-id': userId };

  function apiFetch(url, opts) {
    return fetch(API_BASE + url, Object.assign({ headers: authHeaders }, opts || {}))
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'API error'); });
        return r.json();
      });
  }

  const $ = id => document.getElementById(id);
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function priClass(p) {
    return { Low: 'pri-low', Medium: 'pri-medium', High: 'pri-high', Critical: 'pri-critical' }[p] || '';
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  Live ERLC map instance                                     */
  /* ─────────────────────────────────────────────────────────── */
  var _cadMap = null;

  function initMap() {
    if (_cadMap) return; // already initialised
    if (typeof CadMap === 'undefined') return;
    _cadMap = new CadMap({
      containerId:  'd-map-container',
      serverId:     serverId,
      userId:       userId,
      pollInterval: 8000,
    });
  }

  function destroyMap() {
    if (_cadMap) { _cadMap.destroy(); _cadMap = null; }
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  ERLC live unit data (used to enrich the units table)       */
  /* ─────────────────────────────────────────────────────────── */
  var _linkedUnits = []; // latest linked unit array from /erlc/.../live-units

  function fetchLinkedUnits() {
    fetch(API_BASE + '/erlc/' + serverId + '/live-units', { headers: authHeaders })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        _linkedUnits = data.linked || [];
        // Re-render the units table if the CAD panel is active
        if ($('panel-cad') && $('panel-cad').classList.contains('active')) {
          fetchUnits();
        }
      })
      .catch(function () {});
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  PANEL SWITCHING                                            */
  /* ─────────────────────────────────────────────────────────── */
  const PANELS = ['home', 'map', 'cad', 'search', 'reports', 'callhistory', 'notepad'];

  function updateCadButtonSpacing() {
    const createCallBtn = $('btn-create-call');
    const createBoloBtn = $('btn-create-bolo');
    const callsList = $('d-calls-list');
    const bolosList = $('d-bolos-list');

    if (createCallBtn) {
      const callRows = callsList ? callsList.querySelectorAll('.tbl-row').length : 0;
      const callBodyHeight = Math.max(2.625, (callRows || 1) * 2.75);
      createCallBtn.style.top = (10.125 + callBodyHeight + 1.25) + 'rem';
    }

    if (createBoloBtn) {
      const boloRows = bolosList ? bolosList.querySelectorAll('.tbl-row').length : 0;
      const boloBodyHeight = Math.max(2.625, (boloRows || 1) * 2.75);
      createBoloBtn.style.top = (23.0 + boloBodyHeight + 1.25) + 'rem';
    }
  }

  function showPanel(id) {
    PANELS.forEach(function (p) {
      const panel = $('panel-' + p);
      const btn   = $('btn-' + p);
      if (panel) panel.classList.toggle('active', p === id);
      if (btn)   btn.classList.toggle('d-btn--active', p === id);
    });

    if (id === 'map') {
      initMap();
    } else {
      /* Keep the map alive in the background so it still polls,
         but only destroy when navigating away entirely */
    }

    if (id === 'cad') { fetchCalls(); fetchBolos(); fetchUnits(); fetchErlcCalls(); }
    if (id === 'callhistory') fetchHistory();
  }

  PANELS.forEach(function (p) {
    const btn = $('btn-' + p);
    if (btn) btn.addEventListener('click', function () { showPanel(p); });
  });

  $('btn-clockout').addEventListener('click', function () {
    if (unitId) apiFetch('/units/clock-out/' + unitId, { method: 'DELETE' }).catch(function () {});
    destroyMap();
    window.location.href = 'server-page.html';
  });

  /* ─────────────────────────────────────────────────────────── */
  /*  STATUS BUTTONS                                             */
  /* ─────────────────────────────────────────────────────────── */
  let currentStatus = null;
  document.querySelectorAll('.d-status-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.d-status-btn').forEach(function (b) { b.classList.remove('d-status-btn--active-glow'); });
      if (currentStatus !== btn.dataset.code) {
        btn.classList.add('d-status-btn--active-glow');
        currentStatus = btn.dataset.code;
      } else {
        currentStatus = null;
      }
    });
  });

  /* ─────────────────────────────────────────────────────────── */
  /*  MODAL HELPERS                                              */
  /* ─────────────────────────────────────────────────────────── */
  const MODALS = ['d-call-modal', 'd-bolo-modal'];
  function openModal(id)  { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  MODALS.forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === this) closeModal(id); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') MODALS.forEach(closeModal); });

  $('btn-create-call').addEventListener('click', function () { openModal('d-call-modal'); });
  $('btn-create-bolo').addEventListener('click', function () { openModal('d-bolo-modal'); });
  $('btn-close-call-modal').addEventListener('click', function () { closeModal('d-call-modal'); });
  $('btn-close-bolo-modal').addEventListener('click', function () { closeModal('d-bolo-modal'); });

  function clearFields(ids) {
    ids.forEach(function (id) {
      const el = $(id); if (!el) return;
      el.tagName === 'SELECT' ? (el.selectedIndex = 0) : (el.value = '');
    });
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  ACTIVE CALLS                                               */
  /* ─────────────────────────────────────────────────────────── */
  function fetchCalls() {
    apiFetch('/calls/' + serverId)
      .then(function (rows) { renderCalls(rows); })
      .catch(function () {});
  }

  function renderCalls(calls) {
    const el = $('d-calls-list');
    if (!calls.length) { el.innerHTML = '<div class="d-empty">No active calls.</div>'; updateCadButtonSpacing(); return; }
    el.innerHTML = calls.map(function (c) {
      return '<div class="tbl-row">' +
        '<span class="d-row-cell" style="width:6.25rem">'    + esc(c.id)       + '</span>' +
        '<span class="d-row-cell" style="flex:1">'           + esc(c.nature)   + '</span>' +
        '<span class="d-row-cell" style="width:18.75rem">'   + esc(c.location) + '</span>' +
        '<span class="d-row-cell ' + priClass(c.priority) + '" style="width:7.5rem">' + esc(c.priority) + '</span>' +
        '<span class="d-row-cell" style="width:7.5rem">'     + esc(c.units || '') + '</span>' +
        '<button class="d-code4-btn" data-id="' + c.id + '">CODE 4</button>' +
        '</div>';
    }).join('');

    el.querySelectorAll('.d-code4-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        apiFetch('/calls/' + btn.dataset.id + '/close', {
          method: 'PATCH',
          body: JSON.stringify({ serverId: Number(serverId) }),
        })
          .then(function () { fetchCalls(); })
          .catch(function (err) { alert(err.message); });
      });
    });

    updateCadButtonSpacing();
  }

  $('btn-submit-call').addEventListener('click', function () {
    const nature   = $('d-call-nature').value.trim()   || 'Unknown';
    const location = $('d-call-location').value.trim() || 'Unknown';
    const priority = $('d-call-priority').value;

    apiFetch('/calls', {
      method: 'POST',
      body: JSON.stringify({ serverId: Number(serverId), nature, location, priority }),
    })
      .then(function () {
        fetchCalls();
        closeModal('d-call-modal');
        clearFields(['d-call-nature', 'd-call-title', 'd-call-location', 'd-call-desc']);
      })
      .catch(function (err) { alert(err.message); });
  });

  /* ─────────────────────────────────────────────────────────── */
  /*  ERLC IN-GAME EMERGENCY CALLS                               */
  /* ─────────────────────────────────────────────────────────── */
  function fetchErlcCalls() {
    const el = $('d-erlc-calls-list');
    if (!el) return;

    fetch(API_BASE + '/erlc/' + serverId + '/emergency-calls', { headers: authHeaders })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (calls) { renderErlcCalls(calls); })
      .catch(function () { renderErlcCalls([]); });
  }

  function renderErlcCalls(calls) {
    const el = $('d-erlc-calls-list');
    if (!el) return;

    if (!calls.length) {
      el.innerHTML = '<div class="d-empty">No ERLC in-game calls – configure your ERLC Server Key in Server Settings to enable.</div>';
      return;
    }

    el.innerHTML = calls.map(function (c) {
      return '<div class="tbl-row">' +
        '<span class="d-row-cell" style="width:7.5rem;color:rgba(255,255,255,0.55);font-size:1rem;">'  + esc(c.erlcCallId) + '</span>' +
        '<span class="d-row-cell" style="width:12.5rem">'  + esc(c.caller)   + '</span>' +
        '<span class="d-row-cell" style="width:15.625rem">' + esc(c.nature)   + '</span>' +
        '<span class="d-row-cell" style="flex:1">'          + esc(c.location) + '</span>' +
        '<span class="d-row-cell" style="width:6.875rem;color:' + (c.status === 'Pending' ? '#ffbb00' : '#00ff2f') + '">' + esc(c.status) + '</span>' +
        '<button class="d-import-call-btn" ' +
          'data-nature="' + esc(c.nature) + '" ' +
          'data-location="' + esc(c.location) + '" ' +
          'data-erlcid="' + esc(c.erlcCallId) + '" ' +
          'data-pos-x="' + esc(c.rawPosition ? c.rawPosition.x ?? '' : '') + '" ' +
          'data-pos-z="' + esc(c.rawPosition ? c.rawPosition.z ?? '' : '') + '">' +
          'Import' +
        '</button>' +
        '</div>';
    }).join('');

    el.querySelectorAll('.d-import-call-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        btn.textContent = '…';

        apiFetch('/erlc/' + serverId + '/import-call', {
          method: 'POST',
          body: JSON.stringify({
            erlcCallId: btn.dataset.erlcid,
            nature:     btn.dataset.nature   || 'Emergency',
            location:   btn.dataset.location || 'Unknown',
            priority:   'High',
            posX:       btn.dataset.posX !== '' ? Number(btn.dataset.posX) : null,
            posZ:       btn.dataset.posZ !== '' ? Number(btn.dataset.posZ) : null,
          }),
        })
          .then(function () {
            btn.textContent = '✓ Done';
            btn.style.background = '#00aa22';
            fetchCalls();
            // Refresh map to show new call pin
            if (_cadMap) _cadMap.refresh();
          })
          .catch(function (err) {
            btn.disabled = false;
            btn.textContent = 'Import';
            alert('Import failed: ' + err.message);
          });
      });
    });
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  ACTIVE BOLOs                                               */
  /* ─────────────────────────────────────────────────────────── */
  function fetchBolos() {
    apiFetch('/bolos/' + serverId)
      .then(function (rows) { renderBolos(rows); })
      .catch(function () {});
  }

  function renderBolos(bolos) {
    const el = $('d-bolos-list');
    if (!bolos.length) { el.innerHTML = '<div class="d-empty">No active BOLOs.</div>'; updateCadButtonSpacing(); return; }
    el.innerHTML = bolos.map(function (b) {
      const desc = b.description || '';
      return '<div class="tbl-row">' +
        '<span class="d-row-cell" style="width:13.75rem">' + esc(b.type)   + '</span>' +
        '<span class="d-row-cell" style="width:21.875rem">' + esc(b.reason) + '</span>' +
        '<span class="d-row-cell" style="flex:1">' + esc(desc.substring(0, 80)) + (desc.length > 80 ? '…' : '') + '</span>' +
        '<button class="d-remove-btn" data-id="' + b.id + '">Remove</button>' +
        '</div>';
    }).join('');

    el.querySelectorAll('.d-remove-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        apiFetch('/bolos/' + btn.dataset.id, {
          method: 'DELETE',
          body: JSON.stringify({ serverId: Number(serverId) }),
        })
          .then(function () { fetchBolos(); })
          .catch(function (err) { alert(err.message); });
      });
    });

    updateCadButtonSpacing();
  }

  $('btn-submit-bolo').addEventListener('click', function () {
    const type = $('d-bolo-type').value;
    const loc  = $('d-bolo-loc').value.trim()  || '';
    const desc = $('d-bolo-desc').value.trim();
    if (!desc) { alert('Description is required.'); return; }

    apiFetch('/bolos', {
      method: 'POST',
      body: JSON.stringify({ serverId: Number(serverId), type, reason: loc, description: desc }),
    })
      .then(function () {
        fetchBolos();
        closeModal('d-bolo-modal');
        clearFields(['d-bolo-loc', 'd-bolo-desc']);
      })
      .catch(function (err) { alert(err.message); });
  });

  /* ─────────────────────────────────────────────────────────── */
  /*  ACTIVE UNITS  (enriched with ERLC live location)          */
  /* ─────────────────────────────────────────────────────────── */
  function fetchUnits() {
    apiFetch('/units/' + serverId)
      .then(function (rows) { renderUnits(rows); })
      .catch(function () {});
  }

  function renderUnits(units) {
    const el = $('d-units-list');
    if (!units.length) { el.innerHTML = '<div class="d-empty">No units on duty.</div>'; return; }

    /* Build a quick lookup: unit.id → linked entry (with ERLC position) */
    var linkedMap = {};
    _linkedUnits.forEach(function (lu) { linkedMap[lu.id] = lu; });

    el.innerHTML = units.map(function (u) {
      const dept      = (u.department || '').toLowerCase();
      const typeLabel = dept.includes('fire') || dept.includes('rescue') ? 'FD' :
                        dept.includes('transport') || dept.includes('dot') ? 'DOT' : 'LEO';
      const typeClass  = typeLabel === 'LEO' ? 'd-row-cell--leo' : typeLabel === 'FD' ? 'd-row-cell--fd' : '';
      const statusColor = u.status === 'AVAILABLE' ? 'd-row-cell--green' : '';

      /* ERLC live position */
      var linkedUnit   = linkedMap[u.id];
      var liveLocation = '';
      if (linkedUnit && linkedUnit.position) {
        var pos = linkedUnit.position;
        liveLocation = '📍 ' + Math.round(pos.x) + ', ' + Math.round(pos.z);
      } else {
        liveLocation = u.location || '';
      }

      return '<div class="tbl-row">' +
        '<span class="d-row-cell" style="width:7.5rem">'   + esc(u.callsign)    + '</span>' +
        '<span class="d-row-cell ' + typeClass + '" style="width:10rem">' + esc(typeLabel) + '</span>' +
        '<span class="d-row-cell" style="flex:1">'         + esc(u.department)  + '</span>' +
        '<span class="d-row-cell" style="width:18.75rem">' + esc(liveLocation)  + '</span>' +
        '<span class="d-row-cell ' + statusColor + '">'    + esc(u.status)      + '</span>' +
        '</div>';
    }).join('');
  }

  /* ─────────────────────────────────────────────────────────── */
  /*  SEARCH                                                     */
  /* ─────────────────────────────────────────────────────────── */
  function doSearch(q, cb) {
    if (q.length < 2) { cb({ characters: [], vehicles: [], firearms: [] }); return; }
    apiFetch('/search/' + serverId + '?q=' + encodeURIComponent(q))
      .then(cb)
      .catch(function () { cb({ characters: [], vehicles: [], firearms: [] }); });
  }

  function makeEmpty(msg) { return '<div class="d-empty">' + msg + '</div>'; }

  $('d-ped-search').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    doSearch(q, function (data) {
      const el    = $('d-ped-results');
      const chars = data.characters || [];
      el.innerHTML = chars.length
        ? chars.map(function (c) {
            return '<div class="tbl-row"><span class="d-row-cell" style="flex:1">' + esc(c.first_name) + '</span><span class="d-row-cell">' + esc(c.last_name) + '</span></div>';
          }).join('')
        : makeEmpty('No results.');
    });
  });

  $('d-car-search').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    doSearch(q, function (data) {
      const el   = $('d-car-results');
      const vehs = data.vehicles || [];
      el.innerHTML = vehs.length
        ? vehs.map(function (v) {
            return '<div class="tbl-row">' +
              '<span class="d-row-cell" style="width:11.875rem">' + esc(v.owner_name || '') + '</span>' +
              '<span class="d-row-cell" style="width:8.125rem">'  + esc(v.plate)            + '</span>' +
              '<span class="d-row-cell" style="flex:1">'          + esc(v.model)            + '</span>' +
              '<span class="d-row-cell">'                         + esc(v.color || '')      + '</span></div>';
          }).join('')
        : makeEmpty('No results.');
    });
  });

  $('d-gun-search').addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    doSearch(q, function (data) {
      const el  = $('d-gun-results');
      const fas = data.firearms || [];
      el.innerHTML = fas.length
        ? fas.map(function (f) {
            return '<div class="tbl-row"><span class="d-row-cell" style="flex:1">' + esc(f.owner_name || '') + '</span><span class="d-row-cell">' + esc(f.serial) + '</span></div>';
          }).join('')
        : makeEmpty('No results.');
    });
  });

  /* ─────────────────────────────────────────────────────────── */
  /*  CALL HISTORY                                               */
  /* ─────────────────────────────────────────────────────────── */
  let historyData = [];

  function fetchHistory() {
    apiFetch('/calls/' + serverId + '/history')
      .then(function (rows) { historyData = rows; renderHistory(rows); })
      .catch(function () {});
  }

  function renderHistory(list) {
    const el = $('d-history-list');
    if (!list.length) { el.innerHTML = '<div class="d-empty">No calls found.</div>'; return; }
    el.innerHTML = list.map(function (c) {
      return '<div class="tbl-row">' +
        '<span class="d-row-cell" style="width:6.25rem">'  + esc(c.id)       + '</span>' +
        '<span class="d-row-cell" style="flex:1">'         + esc(c.nature)   + '</span>' +
        '<span class="d-row-cell" style="width:18.75rem">' + esc(c.location) + '</span>' +
        '<span class="d-row-cell ' + priClass(c.priority) + '" style="width:7.5rem">' + esc(c.priority) + '</span>' +
        '<span class="d-row-cell">' + esc(c.units || '') + '</span>' +
        '</div>';
    }).join('');
  }

  $('d-hist-search').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderHistory(historyData.filter(function (c) {
      return String(c.id).includes(q) || c.nature.toLowerCase().includes(q) || c.location.toLowerCase().includes(q);
    }));
  });

  /* ─────────────────────────────────────────────────────────── */
  /*  NOTEPAD                                                    */
  /* ─────────────────────────────────────────────────────────── */
  const notepad = $('d-notepad-text');
  try { const s = localStorage.getItem('cad_dispatcher_notepad'); if (s) notepad.value = s; } catch (_) {}
  notepad.addEventListener('input', function () {
    try { localStorage.setItem('cad_dispatcher_notepad', notepad.value); } catch (_) {}
  });

/* EDIT 3 – ADD syncERLCCalls before init block: */
  function syncERLCCalls() {
    apiFetch('/erlc/' + serverId + '/sync-calls', { method: 'POST', body: '{}' })
      .then(function (r) {
        if (r.synced > 0) {
          fetchCalls(); // dispatcher always refreshes calls
        }
      })
      .catch(function () {});
  }
 
/* EDIT 4 – REPLACE bottom init block with: */
  fetchCalls();
  fetchBolos();
  fetchUnits();
  fetchHistory();
 
  // Sync ERLC calls on load + every 30 s (dispatcher is the primary sync point)
  syncERLCCalls();
  setInterval(syncERLCCalls, 30000);
 
  setInterval(function () {
    fetchCalls();
    fetchBolos();
    fetchUnits();
  }, 10000);

})();
/**
 * dot.js  DOT CAD
 * Full API integration: calls, search, reports.
 */

(function () {
  'use strict';

  const API_BASE = '';

  function get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }

  const userId    = get('cad_user_id');
  const serverId  = get('cad_active_server');
  const unitId = get('cad_unit_id');

  if (!userId || !serverId) { window.location.href = '/server'; return; }

  const token = get('cad_token');
  const authHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') };

  function apiFetch(url, opts) {
    return fetch(API_BASE + url, Object.assign({ headers: authHeaders }, opts || {}))
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'API error'); });
        return r.json();
      });
  }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function priColor(p) { return { Low: '#00ff2f', Medium: '#ffbb00', High: '#ff8800', Critical: '#ff0004' }[p] || '#fff'; }
  function toRem(value) { return (value / 16) + 'rem'; }

  /* ── Panel switching ─────────────────────────────────────── */
  const PANELS = ['home', 'map', 'cad', 'search', 'reports', 'callhistory'];

  function showPanel(id) {
    PANELS.forEach(function (p) {
      document.getElementById('panel-' + p).classList.remove('active');
      const btn = document.getElementById('dot-nav-' + p);
      if (btn) btn.classList.remove('active');
    });
    document.getElementById('panel-' + id).classList.add('active');
    const ab = document.getElementById('dot-nav-' + id);
    if (ab) ab.classList.add('active');

    if (id === 'cad')         fetchCalls();
    if (id === 'callhistory') fetchHistory();
    if (id === 'reports')     dotShowReport('incident');
  }

  function updateCadButtonSpacing() {
    // Button is now positioned beside the title via CSS — no dynamic override needed
  }

  /* ── Clock-Out ───────────────────────────────────────────── */
  document.getElementById('dot-nav-clockout').addEventListener('click', function () {
    if (unitId) apiFetch('/units/clock-out/' + unitId, { method: 'DELETE' }).catch(function () {});
    window.location.href = '/server';
  });

  PANELS.forEach(function (p) {
    const btn = document.getElementById('dot-nav-' + p);
    if (btn) btn.addEventListener('click', function () { showPanel(p); });
  });

  /* ── Status buttons ──────────────────────────────────────── */
  ['dot-status-available','dot-status-offduty','dot-status-onscene','dot-status-arrived','dot-status-busy'].forEach(function (id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.style.outline = '0.1875rem solid #000';
      setTimeout(function () { btn.style.outline = ''; }, 600);
    });
  });

  /* ── Modal helpers ───────────────────────────────────────── */
  function openModal(id)  { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }

  document.getElementById('dot-btn-create-call').addEventListener('click', function () { openModal('dot-call-modal'); });
  document.getElementById('dot-call-modal-close').addEventListener('click', function () { closeModal('dot-call-modal'); });
  document.getElementById('dot-call-modal-create').addEventListener('click', dotCreateCall);
  document.getElementById('dot-ped-detail-close').addEventListener('click', function () { closeModal('dot-ped-detail'); });

  /* ── Active Calls ────────────────────────────────────────── */
  function fetchCalls() {
    apiFetch('/calls/' + serverId)
      .then(function (rows) {
        /* ── Alert sound detection ────────────────────────── */
        if (typeof AlertSounds !== 'undefined') {
          rows.forEach(function (c) {
            var cid = String(c.id);
            if (!_knownCallIds[cid]) {
              AlertSounds.newCall();
            }
            _knownCallIds[cid] = true;
          });
          /* Detect updates to user's attached call */
          if (dotUnitCurrentCall) {
            var attached = rows.find(function (c) { return String(c.id) === String(dotUnitCurrentCall); });
            if (attached) {
              var key = attached.nature + '|' + attached.location + '|' + attached.priority + '|' + (attached.units || '');
              if (_prevAttachedCallData !== null && _prevAttachedCallData !== key) {
                AlertSounds.callUpdated();
              }
              _prevAttachedCallData = key;
            }
          }
        }
        renderDotCalls(rows);
      })
      .catch(function () {});
  }

  let dotUnitCurrentCall = null;

  /* ── Alert sound state tracking ──────────────────────────── */
  var _knownCallIds = {};
  var _prevAttachedCallData = null;

  function fetchMyUnit() {
    if (!unitId) return;
    apiFetch('/units/' + serverId)
      .then(function (units) {
        var mine = units.find(function (u) { return String(u.id) === String(unitId); });
        dotUnitCurrentCall = mine ? mine.current_call : null;
      })
      .catch(function () {});
  }

  function renderDotCalls(calls) {
    const el = document.getElementById('dot-calls-list');
    if (!calls.length) {
      el.innerHTML = '<div style="height:2.625rem;"></div>';
      updateCadButtonSpacing();
      return;
    }
    el.innerHTML = calls.map(function (c) {
      var onMyCall = unitId && dotUnitCurrentCall !== null && String(dotUnitCurrentCall) === String(c.id);
      var attachBtn = '';
      if (unitId) {
        if (onMyCall) {
          attachBtn = '<button class="dot-detach-btn" data-id="' + c.id + '" style="background:rgba(133,22,22,0.3);color:#ff7c7c;border:0.0625rem solid rgba(133,22,22,0.55);height:1.75rem;padding:0 0.625rem;border-radius:0.5rem;font-family:Inter,sans-serif;font-size:0.75rem;font-weight:700;cursor:pointer;white-space:nowrap;">Detach</button>';
        } else {
          attachBtn = '<button class="dot-attach-btn" data-id="' + c.id + '" style="background:rgba(41,84,195,0.3);color:#7eaaff;border:0.0625rem solid rgba(41,84,195,0.5);height:1.75rem;padding:0 0.625rem;border-radius:0.5rem;font-family:Inter,sans-serif;font-size:0.75rem;font-weight:700;cursor:pointer;white-space:nowrap;">Attach</button>';
        }
      }
      return '<div class="tbl-row">' +
        '<span class="dot-cell dot-cell-callnum">' + esc(c.id)       + '</span>' +
        '<span class="dot-cell dot-cell-nature">'  + esc(c.nature)   + '</span>' +
        '<span class="dot-cell dot-cell-loc">'     + esc(c.location) + '</span>' +
        '<span class="dot-cell dot-cell-pri" style="color:' + priColor(c.priority) + '">' + esc(c.priority) + '</span>' +
        '<span class="dot-cell dot-cell-unit">' + esc(c.units || '') + '</span>' +
        attachBtn +
        '<button class="dot-close-call-btn" data-id="' + c.id + '">CODE 4</button>' +
        '</div>';
    }).join('');

    el.querySelectorAll('.dot-close-call-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        apiFetch('/calls/' + btn.dataset.id + '/close', {
          method: 'PATCH',
          body: JSON.stringify({ serverId: Number(serverId) }),
        })
          .then(function () { fetchCalls(); if (typeof Toast !== 'undefined') Toast.success('Call closed (CODE 4).'); })
          .catch(function (err) { alert(err.message); });
      });
    });

    if (unitId) {
      el.querySelectorAll('.dot-attach-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          apiFetch('/units/' + unitId + '/attach-call', {
            method: 'PATCH',
            body: JSON.stringify({ callId: Number(btn.dataset.id) }),
          })
            .then(function () {
              dotUnitCurrentCall = Number(btn.dataset.id);
              _prevAttachedCallData = null;
              if (typeof AlertSounds !== 'undefined') AlertSounds.callAttached();
              fetchCalls();
              if (typeof Toast !== 'undefined') Toast.success('Attached to call #' + btn.dataset.id);
            })
            .catch(function (err) { alert(err.message); });
        });
      });
      el.querySelectorAll('.dot-detach-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          apiFetch('/units/' + unitId + '/detach-call', { method: 'PATCH' })
            .then(function () {
              dotUnitCurrentCall = null;
              _prevAttachedCallData = null;
              fetchCalls();
              if (typeof Toast !== 'undefined') Toast.success('Detached from call.');
            })
            .catch(function (err) { alert(err.message); });
        });
      });
    }

    updateCadButtonSpacing();
  }

  function dotCreateCall() {
    const nature   = document.getElementById('dot-call-nature').value.trim()   || 'Unknown';
    const location = document.getElementById('dot-call-location').value.trim() || 'Unknown';
    const priority = document.getElementById('dot-call-priority').value;

    apiFetch('/calls', {
      method: 'POST',
      body: JSON.stringify({ serverId: Number(serverId), nature, location, priority }),
    })
      .then(function () {
        fetchCalls();
        closeModal('dot-call-modal');
        ['dot-call-nature','dot-call-title','dot-call-location','dot-call-desc'].forEach(function (id) {
          const f = document.getElementById(id); if (f) f.value = '';
        });
        if (typeof Toast !== 'undefined') Toast.success('Call created.');
      })
      .catch(function (err) { alert(err.message); });
  }

  /* ── Search ──────────────────────────────────────────────── */
  function doSearch(q, cb) {
    if (q.length < 2) { cb({ characters: [], vehicles: [] }); return; }
    apiFetch('/search/' + serverId + '?q=' + encodeURIComponent(q)).then(cb).catch(function () { cb({ characters: [], vehicles: [] }); });
  }

  function renderReportList(rows, emptyMessage) {
    if (!rows || !rows.length) {
      return '<div style="padding:0.875rem 0;color:rgba(255,255,255,.5);font-weight:700;">' + esc(emptyMessage || 'No reports found') + '</div>';
    }

    return rows.map(function (row) {
      return '<div class="tbl-row">' +
        '<span style="font-size:0.95rem;color:#fff;width:10.5rem;">' + esc(row.type) + '</span>' +
        '<span style="font-size:0.95rem;color:#fff;width:8.5rem;">' + esc(new Date(row.createdAt).toLocaleDateString()) + '</span>' +
        '<span style="font-size:0.95rem;color:#fff;flex:1;">' + esc(row.summary || 'No summary provided') + '</span>' +
        '</div>';
    }).join('');
  }

  function serializeReportFields(area) {
    const details = {};
    if (!area) return details;

    area.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (field) {
      details[field.id] = field.value.trim();
    });

    return details;
  }

  function calcAge(dob) {
    if (!dob) return '';
    const p = dob.split('/');
    const d = p.length === 3 ? new Date(p[2], p[0]-1, p[1]) : new Date(dob);
    return isNaN(d) ? dob : Math.floor((Date.now() - d) / (365.25*24*3600*1000));
  }

  document.getElementById('dot-ped-search').addEventListener('input', function () {
    const q  = this.value.trim();
    const el = document.getElementById('dot-ped-results');
    doSearch(q, function (data) {
      const chars = data.characters || [];
      el.innerHTML = chars.length
        ? chars.map(function (c) {
            return '<div class="tbl-row dot-ped-row" data-char="' + encodeURIComponent(JSON.stringify(c)) + '">' +
              '<span style="font-size:1.1875rem;color:#fff;flex:1;">'  + esc(c.first_name) + '</span>' +
              '<span style="font-size:1.1875rem;color:#fff;">'         + esc(c.last_name)  + '</span>' +
              '</div>';
          }).join('')
        : '<div style="height:2.625rem;"></div>';

      el.querySelectorAll('.dot-ped-row').forEach(function (row) {
        row.addEventListener('click', function () {
          dotShowPed(JSON.parse(decodeURIComponent(row.dataset.char)));
        });
      });
    });
  });

  document.getElementById('dot-car-search').addEventListener('input', function () {
    const q  = this.value.trim();
    const el = document.getElementById('dot-car-results');
    doSearch(q, function (data) {
      const vehs = data.vehicles || [];
      el.innerHTML = vehs.length
        ? vehs.map(function (v) {
            return '<div class="tbl-row">' +
              '<span style="font-size:1.1875rem;color:#fff;width:11.25rem;">' + esc(v.owner_name || '') + '</span>' +
              '<span style="font-size:1.1875rem;color:#fff;width:6.25rem;">' + esc(v.plate)              + '</span>' +
              '<span style="font-size:1.1875rem;color:#fff;flex:1;">'      + esc(v.model) + (v.stolen ? '<span class="stolen-badge">🚨 STOLEN</span>' : '') + '</span>' +
              '<span style="font-size:1.1875rem;color:#fff;">'             + esc(v.color || '')       + '</span>' +
              '</div>';
          }).join('')
        : '<div style="height:2.625rem;"></div>';
    });
  });

  function dotShowPed(p) {
    const fields = [
      ['First Name',p.first_name],['Last Name',p.last_name],['D.O.B',p.dob],
      ['AGE',calcAge(p.dob)],['Gender',p.gender],['Occupation',p.occupation],
      ['Height',p.height],['Weight',p.weight],['Skin Tone',p.skin_tone],
      ['Hair Tone',p.hair_tone],['Eye Color',p.eye_color],['Address',p.address],
    ];
    document.getElementById('dot-ped-detail-content').innerHTML = fields.map(function (f) {
      return '<div class="dot-detail-field"><div class="dot-detail-label">' + esc(f[0]) + '</div>' +
             '<div class="dot-detail-value">' + esc(f[1] || '') + '</div></div>';
    }).join('') +
      '<div style="width:100%;margin-top:1rem;">' +
        '<div class="dot-report-section-title mt" style="margin-top:0;">Reports</div>' +
        '<div id="dot-ped-reports"></div>' +
      '</div>';

    apiFetch('/reports/' + serverId + '/character?firstName=' + encodeURIComponent(p.first_name || '') + '&lastName=' + encodeURIComponent(p.last_name || ''))
      .then(function (reports) {
        document.getElementById('dot-ped-reports').innerHTML = renderReportList(reports, 'No reports on record');
      })
      .catch(function () {
        document.getElementById('dot-ped-reports').innerHTML = '<div style="padding:0.875rem 0;color:rgba(255,255,255,.5);font-weight:700;">Unable to load reports</div>';
      })
      .finally(function () {
        openModal('dot-ped-detail');
      });
  }

  /* ── Reports ─────────────────────────────────────────────── */
  function fldRow(fields) {
    return '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">' +
      fields.map(function (f) {
        return '<div style="background:#333;border-radius:0.625rem;padding:0.375rem 0.75rem;width:' + toRem(f[1]) + ';flex-shrink:0;">' +
               '<div style="font-size:0.6875rem;color:rgba(255,255,255,.55);font-weight:700;">' + f[0] + '</div>' +
               '<input id="' + f[2] + '" style="background:transparent;border:none;color:#fff;font-family:Inter,sans-serif;font-size:1rem;font-weight:700;outline:none;width:100%;margin-top:0.125rem;" placeholder="' + f[0] + '"></div>';
      }).join('') + '</div>';
  }

  function callInfo() {
    return '<span class="dot-report-section-title">Call Information</span>' +
      fldRow([['CALL ID',129,'dot-rc-id'],['OSC',184,'dot-rc-osc'],['Call Title',348,'dot-rc-title'],['Location',620,'dot-rc-loc'],['Priority',185,'dot-rc-prio'],['Status',184,'dot-rc-stat']]) +
      '<div style="margin:0.5rem 0;"><p style="font-size:0.8125rem;font-weight:700;color:rgba(255,255,255,.55);margin-bottom:0.25rem;">Units</p>' +
      '<div style="background:#333;border-radius:0.625rem;height:3.5rem;padding:0 0.75rem;display:flex;align-items:center;">' +
      '<input id="dot-rc-units" style="background:transparent;border:none;color:#fff;font-family:Inter,sans-serif;font-size:1.0625rem;font-weight:700;outline:none;width:100%;" placeholder="Unit callsigns..."></div></div>';
  }

  function descArea(id, ph, h) {
    return '<textarea id="' + id + '" style="width:100%;height:' + toRem(h || 180) + ';background:#333;border:none;border-radius:0.75rem;color:#fff;font-family:Inter,sans-serif;font-size:1.0625rem;padding:0.75rem;outline:none;resize:none;" placeholder="' + (ph||'Details...') + '"></textarea>';
  }

  function submitBtn(type) {
    return '<button class="act-btn act-btn-amber dot-report-submit-btn" data-rtype="' + type + '" style="position:relative;margin-top:0.75rem;width:12.5rem;height:2.75rem;font-size:1.5rem;">Submit</button>';
  }

  const DOT_TEMPLATES = {
    incident: function () { return callInfo() + '<span class="dot-report-section-title mt">Details</span>' + descArea('dot-report-details', 'Incident details...') + submitBtn('incident'); },
    tow: function () {
      return callInfo() +
        '<span class="dot-report-section-title mt">Vehicle Information</span>' +
        fldRow([['Brand Model',349,'tow-brand'],['Color',348,'tow-color'],['Plate',185,'tow-plate'],['VIN',185,'tow-vin'],['Reg Expiry',185,'tow-reg'],['Owner',393,'tow-owner']]) +
        fldRow([['Insurance Status',349,'tow-ins'],['Insurance Expiry',348,'tow-insexp']]) +
        descArea('tow-reason', 'Tow details...') +
        submitBtn('tow');
    },
  };

  function dotShowReport(type) {
    document.querySelectorAll('#panel-reports .report-tab').forEach(function (t) { t.classList.remove('active'); });
    const at = document.querySelector('[data-report="' + type + '"]');
    if (at) at.classList.add('active');

    const area = document.getElementById('dot-report-area');
    area.innerHTML = DOT_TEMPLATES[type] ? DOT_TEMPLATES[type]() : '';

    area.querySelectorAll('.dot-report-submit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const details = serializeReportFields(area);
        apiFetch('/reports', {
          method: 'POST',
          body: JSON.stringify({
            serverId: Number(serverId),
            callId: Number(details['dot-rc-id']) || null,
            type: btn.dataset.rtype,
            subjectName: details['tow-owner'] || null,
            subjectPlate: details['tow-plate'] || null,
            details: details,
          }),
        })
          .then(function () { if (typeof Toast !== 'undefined') Toast.success(btn.dataset.rtype.charAt(0).toUpperCase() + btn.dataset.rtype.slice(1) + ' Report submitted!'); })
          .catch(function (err) { if (typeof Toast !== 'undefined') Toast.error('Failed to submit report: ' + err.message); });
      });
    });
  }

  document.querySelectorAll('#panel-reports .report-tab[data-report]').forEach(function (tab) {
    tab.addEventListener('click', function () { dotShowReport(tab.dataset.report); });
  });

  /* ── Call History ────────────────────────────────────────── */
  let historyData = [];

  function fetchHistory() {
    apiFetch('/calls/' + serverId + '/history')
      .then(function (rows) { historyData = rows; dotRenderHistory(rows); })
      .catch(function () {});
  }

  function dotRenderHistory(list) {
    const el = document.getElementById('dot-history-list');
    if (!list.length) { el.innerHTML = '<div style="padding:1.25rem;color:rgba(255,255,255,.3);">No calls found</div>'; return; }
    el.innerHTML = list.map(function (c) {
      return '<div class="tbl-row">' +
        '<span class="dot-hist-cell dot-hist-cell-callnum">'  + esc(c.id)       + '</span>' +
        '<span class="dot-hist-cell dot-hist-cell-nature">'   + esc(c.nature)   + '</span>' +
        '<span class="dot-hist-cell dot-hist-cell-location">' + esc(c.location) + '</span>' +
        '<span class="dot-hist-cell dot-hist-cell-priority" style="color:' + priColor(c.priority) + '">' + esc(c.priority) + '</span>' +
        '<span class="dot-hist-cell"></span></div>';
    }).join('');
  }

  document.getElementById('dot-hist-search').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    dotRenderHistory(historyData.filter(function (c) {
      return String(c.id).includes(q) || c.nature.toLowerCase().includes(q);
    }));
  });

  /* ── Notepad (pop-up modal) ───────────────────────────────── */
  const notepadText = document.getElementById('dot-notepad');
  try { const s = localStorage.getItem('cad_dot_notepad'); if (s) notepadText.value = s; } catch (_) {}
  notepadText.addEventListener('input', function () {
    try { localStorage.setItem('cad_dot_notepad', notepadText.value); } catch (_) {}
  });

  // Wire notepad nav button to open modal
  document.getElementById('dot-nav-notepad').addEventListener('click', function () {
    openModal('dot-notepad-modal');
  });
  document.getElementById('btn-close-notepad-modal').addEventListener('click', function () {
    closeModal('dot-notepad-modal');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal('dot-notepad-modal');
  });

  // Add to overlay-click-to-close
  document.getElementById('dot-notepad-modal').addEventListener('click', function (e) {
    if (e.target === this) closeModal('dot-notepad-modal');
  });

  /* ── Department Docs ─────────────────────────────────────── */
  function loadDeptDocs() {
    var deptName = get('cad_department');
    if (!deptName || !serverId) return;
    apiFetch('/departments/' + serverId + '?type=DOT')
      .then(function (depts) {
        var match = depts.find(function (d) { return d.name === deptName; });
        if (!match) return;
        apiFetch('/dept-docs/' + match.id)
          .then(function (docs) {
            var el = document.getElementById('dot-cad-docs-list');
            if (!el) return;
            if (!docs.length) { el.innerHTML = '<span style="font-size:0.9375rem;color:rgba(255,255,255,0.25);">No department documents.</span>'; return; }
            el.innerHTML = docs.map(function (d) {
              return '<a class="cad-doc-link" href="' + esc(d.url) + '" target="_blank" rel="noopener">📄 ' + esc(d.title) + '</a>';
            }).join('');
          })
          .catch(function () {});
      })
      .catch(function () {});
  }

  /* ── Supervisor Button ───────────────────────────────────── */
  function checkSupervisor() {
    var deptName = get('cad_department');
    if (!deptName || !serverId) return;
    apiFetch('/departments/' + serverId + '?type=DOT')
      .then(function (depts) {
        var match = depts.find(function (d) { return d.name === deptName; });
        if (!match) return;
        dotDeptId = match.id;
        return apiFetch('/dept-members/me/' + match.id);
      })
      .then(function (data) {
        if (!data || !data.member) return;
        var perms = data.permissions || [];
        if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch (_) { perms = []; } }
        if (perms.includes('SUPERVISOR')) {
          var btn = document.getElementById('dot-btn-supervisor');
          if (btn) btn.style.display = '';
        }
      })
      .catch(function () {});
  }

  // Supervisor modal
  document.getElementById('dot-btn-supervisor').addEventListener('click', function () {
    document.getElementById('dot-sup-reports').innerHTML = '<div class="leo-sub-empty">Enter a call ID to view reports.</div>';
    openModal('dot-supervisor-modal');
  });
  document.getElementById('dot-btn-close-supervisor').addEventListener('click', function () { closeModal('dot-supervisor-modal'); });

  // ── Officer Search ─────────────────────────────────────────
  var dotDeptId = null;
  document.getElementById('dot-sup-officer-search').addEventListener('input', function () {
    var q = this.value.trim();
    var el = document.getElementById('dot-sup-officer-results');
    if (q.length < 1) {
      el.innerHTML = '<div class="leo-sub-empty">Type a name to search department members.</div>';
      return;
    }
    if (!dotDeptId) {
      el.innerHTML = '<div class="leo-sub-empty">Department not identified.</div>';
      return;
    }
    apiFetch('/dept-members/supervisor-search/' + dotDeptId + '?q=' + encodeURIComponent(q))
      .then(function (results) {
        if (!results || !results.length) {
          el.innerHTML = '<div class="leo-sub-empty">No officers found.</div>';
          return;
        }
        el.innerHTML = results.map(function (r) {
          var rolesHtml = r.roles && r.roles.length
            ? r.roles.map(function (role) { return '<span class="dm-role-chip">' + esc(role) + '</span>'; }).join('')
            : '<span style="color:rgba(255,255,255,0.3);font-size:0.8125rem;">None</span>';
          var infClass = r.infractionCount > 0
            ? '<span style="color:#ff7c7c;font-weight:700;">' + esc(String(r.infractionCount)) + '</span>'
            : '<span style="color:rgba(255,255,255,0.3);">0</span>';
          var actColor = r.weeklyActivity > 0 ? '#00ff2f' : 'rgba(255,255,255,0.3)';
          return '<div class="tbl-row" style="cursor:default;flex-wrap:wrap;height:auto;padding:0.625rem 1.0625rem;">' +
            '<span style="font-size:1rem;color:#fff;font-weight:700;width:12rem;">' + esc(r.username) + '</span>' +
            '<span style="font-size:0.875rem;color:rgba(255,255,255,0.6);width:8rem;">' + esc(r.rank_name || '—') + '</span>' +
            '<span style="font-size:0.8125rem;flex:1;">Roles: ' + rolesHtml + '</span>' +
            '<span style="font-size:0.8125rem;color:rgba(255,255,255,0.6);width:6rem;">Infractions: ' + infClass + '</span>' +
            '<span style="font-size:0.8125rem;color:' + actColor + ';font-weight:700;width:6rem;">Act: ' + esc(String(r.weeklyActivity || 0)) + '</span>' +
            '</div>';
        }).join('');
      })
      .catch(function () { el.innerHTML = '<div class="leo-sub-empty">Search failed.</div>'; });
  });

  document.getElementById('dot-btn-sup-view-reports').addEventListener('click', function () {
    var callId = document.getElementById('dot-sup-call-id').value.trim();
    if (!callId) return;
    apiFetch('/reports/' + serverId)
      .then(function (reports) {
        var matches = (reports || []).filter(function (r) { return String(r.call_id) === callId || String(r.id) === callId; });
        var el = document.getElementById('dot-sup-reports');
        if (!matches.length) {
          el.innerHTML = '<div class="leo-sub-empty">No reports found for Call #' + esc(callId) + '.</div>';
        } else {
          el.innerHTML = matches.map(function (r) {
            return '<div class="tbl-row" style="cursor:default;">' +
              '<span style="font-size:0.9375rem;color:#fff;width:8rem;">' + esc(r.type) + '</span>' +
              '<span style="font-size:0.9375rem;color:#fff;flex:1;">' + esc(r.subject_name || '—') + '</span>' +
              '<span style="font-size:0.8125rem;color:rgba(255,255,255,0.4);">' + esc(new Date(r.created_at).toLocaleDateString()) + '</span>' +
              '<button class="leo-report-pdf-btn" data-id="' + r.id + '" ' +
                'style="background:rgba(41,84,195,0.3);color:#7eaaff;border:0.0625rem solid rgba(41,84,195,0.5);' +
                'height:1.875rem;padding:0 0.75rem;border-radius:0.5rem;font-family:Inter,sans-serif;' +
                'font-size:0.75rem;font-weight:700;cursor:pointer;white-space:nowrap;margin-right:0.5rem;">📄 PDF</button>' +
              '</div>';
          }).join('');
        }
      })
      .catch(function () { document.getElementById('dot-sup-reports').innerHTML = '<div class="leo-sub-empty">Error loading reports.</div>'; });
  });

/* ── PDF download delegation ────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.leo-report-pdf-btn');
    if (!btn) return;
    var id = btn.dataset.id;
    btn.disabled = true;
    var originalText = btn.textContent;
    btn.textContent = '…';

    CAD.downloadPdf('/reports/' + id + '/pdf', 'report-' + id + '.pdf')
      .catch(function (err) { if (typeof Toast !== 'undefined') Toast.error(err.message || 'PDF download failed.'); })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = originalText;
      });
  });

  // Init
  loadDeptDocs();
  checkSupervisor();

/* EDIT 3 – ADD syncERLCCalls before init block: */
  function syncERLCCalls() {
    apiFetch('/erlc/' + serverId + '/sync-calls', { method: 'POST', body: '{}' })
      .then(function (r) {
        if (r.synced > 0 && document.getElementById('panel-cad').classList.contains('active')) {
          fetchCalls();
        }
      })
      .catch(function () {});
  }
 
/* EDIT 4 – REPLACE bottom init block with: */
  showPanel('home');
  fetchCalls();
  fetchMyUnit();
  dotShowReport('incident');
 
  syncERLCCalls();
  setInterval(syncERLCCalls, 30000);
  setInterval(function () {
    fetchCalls();
    fetchMyUnit();
  }, 12000);

})();

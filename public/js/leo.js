/**
 * leo.js  Law Enforcement CAD
 * Full API integration: calls, BOLOs, search, reports.
 * Polls active calls and BOLOs every 12 seconds.
 */

(function () {
  'use strict';

  const API_BASE = '';

  /* ── Storage helpers ────────────────────────────────────── */
  function get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }

  /* ── Session context ────────────────────────────────────── */
  const userId    = get('cad_user_id');
  const serverId  = get('cad_active_server');
  const unitId = get('cad_unit_id');

  if (!userId || !serverId) {
    window.location.href = 'server-page.html';
    return;
  }

  const authHeaders = { 'Content-Type': 'application/json', 'x-user-id': userId };

  /* ── Helpers ─────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const toRem = value => (value / 16) + 'rem';

  function priClass(p) {
    return { Low: 'pri-low', Medium: 'pri-medium', High: 'pri-high', Critical: 'pri-critical' }[p] || '';
  }

  function apiFetch(url, opts) {
    return fetch(API_BASE + url, Object.assign({ headers: authHeaders }, opts || {}))
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'API error'); });
        return r.json();
      });
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PANEL SWITCHING
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const PANELS = ['home', 'map', 'cad', 'search', 'reports', 'callhistory', 'notepad'];

  function showPanel(id) {
    PANELS.forEach(function (p) {
      const panel = $('panel-' + p);
      const btn   = $('btn-' + p);
      if (panel) panel.classList.toggle('active', p === id);
      if (btn)   btn.classList.toggle('leo-btn--active', p === id);
    });
    if (id === 'cad')         { fetchCalls(); fetchBolos(); }
    if (id === 'callhistory') fetchHistory();
    if (id === 'reports' && !$('leo-report-area').innerHTML.trim()) loadReport('warning');
  }

  PANELS.forEach(function (p) {
    const btn = $('btn-' + p);
    if (btn) btn.addEventListener('click', function () { showPanel(p); });
  });

  $('btn-clockout').addEventListener('click', function () {
    if (unitId) {
      apiFetch('/units/clock-out/' + unitId, { method: 'DELETE' }).catch(function () {});
    }
    window.location.href = 'server-page.html';
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     STATUS BUTTONS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  let currentStatus = null;

  document.querySelectorAll('.leo-status-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.leo-status-btn').forEach(function (b) {
        b.classList.remove('leo-status-btn--active-glow');
      });
      if (currentStatus !== btn.dataset.code) {
        btn.classList.add('leo-status-btn--active-glow');
        currentStatus = btn.dataset.code;

        // Persist status to API
        const statusMap = { '10-8': 'AVAILABLE', '10-7': 'UNAVAILABLE', '10-97': 'ON SCENE', '10-23': 'ENROUTE', '10-6': 'BUSY' };
        if (unitId) {
          apiFetch('/units/' + unitId + '/status', {
            method: 'PATCH',
            body: JSON.stringify({ status: statusMap[btn.dataset.code] || 'AVAILABLE', serverId: Number(serverId) }),
          }).catch(function () {});
        }
      } else {
        currentStatus = null;
      }
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     MODAL HELPERS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const ALL_MODALS = [
    'leo-call-modal', 'leo-bolo-modal',
    'leo-ped-detail-modal', 'leo-veh-detail-modal', 'leo-gun-detail-modal'
  ];

  function openModal(id)  { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  ALL_MODALS.forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === $(id)) closeModal(id); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') ALL_MODALS.forEach(function (id) { closeModal(id); });
  });

  $('btn-create-call').addEventListener('click', function () { openModal('leo-call-modal'); });
  $('btn-create-bolo').addEventListener('click', function () { openModal('leo-bolo-modal'); });
  $('btn-close-call-modal').addEventListener('click',  function () { closeModal('leo-call-modal'); });
  $('btn-close-bolo-modal').addEventListener('click',  function () { closeModal('leo-bolo-modal'); });
  $('btn-close-ped-detail').addEventListener('click',  function () { closeModal('leo-ped-detail-modal'); });
  $('btn-close-veh-detail').addEventListener('click',  function () { closeModal('leo-veh-detail-modal'); });
  $('btn-close-gun-detail').addEventListener('click',  function () { closeModal('leo-gun-detail-modal'); });

  function clearFields(ids) {
    ids.forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.tagName === 'SELECT' ? (el.selectedIndex = 0) : (el.value = '');
    });
  }

  function updateCadButtonSpacing() {
    const createCallBtn = $('btn-create-call');
    const createBoloBtn = $('btn-create-bolo');
    const callsList = $('leo-calls-list');
    const bolosList = $('leo-bolos-list');
    if (createCallBtn && callsList) {
      createCallBtn.style.top = (callsList.offsetTop + callsList.offsetHeight + 20) + 'px';
    }
    if (createBoloBtn && bolosList) {
      createBoloBtn.style.top = (bolosList.offsetTop + bolosList.offsetHeight + 20) + 'px';
    }
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     ACTIVE CALLS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  let leoCalls  = [];
  let leoNextId = '';

  function fetchCalls() {
    apiFetch('/calls/' + serverId)
      .then(function (rows) {
        leoCalls  = rows;
        renderCalls();
      })
      .catch(function () {});
  }

  function renderCalls() {
    const el = $('leo-calls-list');
    if (!leoCalls.length) {
      el.innerHTML = '<div class="leo-empty">No active calls.</div>';
      updateCadButtonSpacing();
      return;
    }
    el.innerHTML = leoCalls.map(function (c) {
      return (
        '<div class="tbl-row">' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff;width:5rem">'  + esc(c.id)       + '</span>' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff;flex:1">'      + esc(c.nature)   + '</span>' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff;width:18.75rem">' + esc(c.location) + '</span>' +
          '<span style="font-size:1.25rem;font-weight:700;width:7.5rem" class="' + priClass(c.priority) + '">' + esc(c.priority) + '</span>' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff;width:6.25rem">' + esc(c.units || '') + '</span>' +
          '<button class="leo-code4-btn" data-id="' + c.id + '">CODE 4</button>' +
        '</div>'
      );
    }).join('');

    el.querySelectorAll('.leo-code4-btn').forEach(function (btn) {
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
    const nature   = $('lc-nature').value.trim()   || 'Unknown';
    const location = $('lc-location').value.trim() || 'Unknown';
    const priority = $('lc-priority').value;

    apiFetch('/calls', {
      method: 'POST',
      body: JSON.stringify({ serverId: Number(serverId), nature, location, priority }),
    })
      .then(function () {
        fetchCalls();
        closeModal('leo-call-modal');
        clearFields(['lc-nature','lc-title','lc-location','lc-desc']);
      })
      .catch(function (err) { alert(err.message); });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     ACTIVE BOLOs
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  function fetchBolos() {
    apiFetch('/bolos/' + serverId)
      .then(function (rows) { renderBolos(rows); })
      .catch(function () {});
  }

  function renderBolos(bolos) {
    const el = $('leo-bolos-list');
    if (!bolos || !bolos.length) {
      el.innerHTML = '<div class="leo-empty">No active BOLOs.</div>';
      updateCadButtonSpacing();
      return;
    }
    el.innerHTML = bolos.map(function (b) {
      return (
        '<div class="tbl-row">' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff;width:12.5rem">' + esc(b.type) + '</span>' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff;flex:1">' + esc(b.description.substring(0, 80)) + (b.description.length > 80 ? '…' : '') + '</span>' +
          '<button class="leo-remove-btn" data-id="' + b.id + '">Remove</button>' +
        '</div>'
      );
    }).join('');

    el.querySelectorAll('.leo-remove-btn').forEach(function (btn) {
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
    const type = $('lb-type').value;
    const desc = $('lb-desc').value.trim();
    const loc  = $('lb-location').value.trim() || '';
    if (!desc) { alert('Description is required.'); return; }

    apiFetch('/bolos', {
      method: 'POST',
      body: JSON.stringify({ serverId: Number(serverId), type, reason: loc, description: desc }),
    })
      .then(function () {
        fetchBolos();
        closeModal('leo-bolo-modal');
        clearFields(['lb-location','lb-desc']);
      })
      .catch(function (err) { alert(err.message); });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     SEARCH
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  function chip(label, value, red) {
    return (
      '<div class="leo-detail-chip">' +
        '<span class="leo-detail-chip-label">' + esc(label) + '</span>' +
        '<span class="leo-detail-chip-value' + (red ? ' leo-detail-chip-value--red' : '') + '">' + esc(value || '') + '</span>' +
      '</div>'
    );
  }

  function calcAge(dobStr) {
    if (!dobStr) return '';
    const parts = dobStr.split('/');
    const dob = parts.length === 3 ? new Date(parts[2], parts[0] - 1, parts[1]) : new Date(dobStr);
    if (isNaN(dob)) return dobStr;
    return Math.floor((Date.now() - dob) / (365.25 * 24 * 3600 * 1000));
  }

  function doSearch(q, callback) {
    if (q.length < 2) { callback({ characters: [], vehicles: [], firearms: [] }); return; }
    apiFetch('/search/' + serverId + '?q=' + encodeURIComponent(q))
      .then(callback)
      .catch(function () { callback({ characters: [], vehicles: [], firearms: [] }); });
  }

  function fetchExactCharacter(firstName, lastName) {
    const first = String(firstName || '').trim();
    const last = String(lastName || '').trim();
    if (!first || !last) return Promise.resolve(null);

    return apiFetch('/search/' + serverId + '?q=' + encodeURIComponent(first + ' ' + last))
      .then(function (data) {
        const chars = data.characters || [];
        return chars.find(function (character) {
          return String(character.first_name || '').trim().toLowerCase() === first.toLowerCase() &&
                 String(character.last_name || '').trim().toLowerCase() === last.toLowerCase();
        }) || null;
      })
      .catch(function () { return null; });
  }

  function fillInput(id, value) {
    const input = $(id);
    if (input) input.value = value == null ? '' : value;
  }

  function attachCharacterAutofill(area) {
    if (!area || area.dataset.characterAutofillBound === 'true') return;

    const firstNameInput = area.querySelector('#r-fn');
    const lastNameInput = area.querySelector('#r-ln');
    if (!firstNameInput || !lastNameInput) return;

    let lookupToken = 0;
    const tryAutofill = function () {
      const firstName = firstNameInput.value.trim();
      const lastName = lastNameInput.value.trim();
      if (!firstName || !lastName) return;

      lookupToken += 1;
      const currentToken = lookupToken;
      fetchExactCharacter(firstName, lastName).then(function (character) {
        if (currentToken !== lookupToken || !character) return;
        fillInput('r-dob', character.dob);
        fillInput('r-age', calcAge(character.dob));
        fillInput('r-gen', character.gender);
        fillInput('r-occ', character.occupation);
        fillInput('r-h', character.height);
        fillInput('r-w', character.weight);
        fillInput('r-skin', character.skin_tone);
        fillInput('r-hair', character.hair_tone);
        fillInput('r-eye', character.eye_color);
        fillInput('r-addr', character.address);
      });
    };

    firstNameInput.addEventListener('blur', tryAutofill);
    lastNameInput.addEventListener('blur', tryAutofill);
    area.dataset.characterAutofillBound = 'true';
  }

  function serializeReportFields(area) {
    const details = {};
    if (!area) return details;

    area.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (field) {
      details[field.id] = field.value.trim();
    });

    return details;
  }

  function renderReportList(rows, emptyMessage) {
    if (!rows || !rows.length) {
      return '<div class="leo-sub-empty">' + esc(emptyMessage || 'No reports found') + '</div>';
    }

    return rows.map(function (row) {
      return '<div class="tbl-row">' +
        '<span style="font-size:1rem;color:#fff;padding:1rem;">' + esc(row.type) + '</span>' +
        '<span style="font-size:1rem;color:#fff;padding:1rem;">' + esc(new Date(row.createdAt).toLocaleDateString()) + '</span>' +
        '<span style="font-size:1rem;color:#fff;flex:1;padding:1rem;">' + esc(row.summary || 'No summary provided') + '</span>' +
        '</div>';
    }).join('');
  }

  /* PED search */
  $('leo-ped-search').addEventListener('input', function () {
    const q  = this.value.trim();
    const el = $('leo-ped-results');
    doSearch(q, function (data) {
      const chars = data.characters || [];
      el.innerHTML = chars.length
        ? chars.map(function (c) {
            return (
              '<div class="tbl-row leo-ped-row" data-char="' + encodeURIComponent(JSON.stringify(c)) + '">' +
                '<span style="font-size:1.1875rem;color:#fff;flex:1">' + esc(c.first_name) + '</span>' +
                '<span style="font-size:1.1875rem;color:#fff">'        + esc(c.last_name)  + '</span>' +
              '</div>'
            );
          }).join('')
        : '<div class="leo-empty">No results.</div>';

      el.querySelectorAll('.leo-ped-row').forEach(function (row) {
        row.addEventListener('click', function () {
          showPedDetail(JSON.parse(decodeURIComponent(row.dataset.char)));
        });
      });
    });
  });

  function showPedDetail(p) {
    $('leo-ped-detail-content').innerHTML = [
      ['First Name', p.first_name], ['Last Name', p.last_name], ['D.O.B', p.dob],
      ['AGE', calcAge(p.dob)], ['Gender', p.gender], ['Occupation', p.occupation],
      ['Height', p.height], ['Weight', p.weight], ['Skin Tone', p.skin_tone],
      ['Hair Tone', p.hair_tone], ['Eye Color', p.eye_color], ['Address', p.address],
    ].map(function (f) { return chip(f[0], f[1]); }).join('');

    // Fetch linked vehicles and firearms
    if (p.id && serverId) {
      apiFetch('/vehicles/' + serverId + '/character/' + p.id)
        .then(function (vehs) {
          $('leo-ped-vehicles').innerHTML = vehs.length
            ? vehs.map(function (v) {
                return '<div class="tbl-row"><span style="font-size:1.0625rem;color:#fff;width:11.25rem">' + esc(v.owner_name || '') + '</span>' +
                  '<span style="font-size:1.0625rem;color:#fff;width:6.25rem">' + esc(v.plate) + '</span>' +
                  '<span style="font-size:1.0625rem;color:#fff;flex:1">' + esc(v.model) + '</span>' +
                  '<span style="font-size:1.0625rem;color:#fff">' + esc(v.color || '') + '</span></div>';
              }).join('')
            : '<div class="leo-sub-empty">No vehicles registered</div>';
        })
        .catch(function () {});

      apiFetch('/firearms/' + serverId + '/character/' + p.id)
        .then(function (fas) {
          $('leo-ped-firearms').innerHTML = fas.length
            ? fas.map(function (f) {
                return '<div class="tbl-row"><span style="font-size:1.0625rem;color:#fff;flex:1">' + esc(f.owner_name || '') + '</span>' +
                  '<span style="font-size:1.0625rem;color:#fff">' + esc(f.serial) + '</span></div>';
              }).join('')
            : '<div class="leo-sub-empty">No firearms registered</div>';
        })
        .catch(function () {});

      apiFetch('/reports/' + serverId + '/character?firstName=' + encodeURIComponent(p.first_name || '') + '&lastName=' + encodeURIComponent(p.last_name || ''))
        .then(function (reports) {
          $('leo-ped-reports').innerHTML = renderReportList(reports, 'No reports on record');
        })
        .catch(function () {
          $('leo-ped-reports').innerHTML = '<div class="leo-sub-empty">Unable to load reports</div>';
        });
    }

    openModal('leo-ped-detail-modal');
  }

  /* Car search */
  $('leo-car-search').addEventListener('input', function () {
    const q  = this.value.trim();
    const el = $('leo-car-results');
    doSearch(q, function (data) {
      const vehs = data.vehicles || [];
      el.innerHTML = vehs.length
        ? vehs.map(function (v) {
            return (
              '<div class="tbl-row leo-car-row" data-veh="' + encodeURIComponent(JSON.stringify(v)) + '">' +
                '<span style="font-size:1.1875rem;color:#fff;width:11.25rem">' + esc(v.owner_name || '') + '</span>' +
                '<span style="font-size:1.1875rem;color:#fff;width:6.25rem">' + esc(v.plate) + '</span>' +
                '<span style="font-size:1.1875rem;color:#fff;flex:1">'      + esc(v.model) + '</span>' +
                '<span style="font-size:1.1875rem;color:#fff">'             + esc(v.color || '') + '</span>' +
              '</div>'
            );
          }).join('')
        : '<div class="leo-empty">No results.</div>';

      el.querySelectorAll('.leo-car-row').forEach(function (row) {
        row.addEventListener('click', function () {
          showVehDetail(JSON.parse(decodeURIComponent(row.dataset.veh)));
        });
      });
    });
  });

  function showVehDetail(v) {
    $('leo-veh-detail-content').innerHTML = [
      ['Brand / Model', v.model], ['Color', v.color], ['Plate', v.plate], ['VIN', v.vin],
      ['Reg Expiry', v.registration_expiry], ['Owner', v.owner_name],
      ['Insurance Status', v.insurance_status, v.insurance_status === 'Expired'],
      ['Insurance Expiry', v.insurance_expiry],
    ].map(function (f) { return chip(f[0], f[1], f[2]); }).join('');
    openModal('leo-veh-detail-modal');
  }

  /* Gun search */
  $('leo-gun-search').addEventListener('input', function () {
    const q  = this.value.trim();
    const el = $('leo-gun-results');
    doSearch(q, function (data) {
      const fas = data.firearms || [];
      el.innerHTML = fas.length
        ? fas.map(function (f) {
            return (
              '<div class="tbl-row leo-gun-row" data-fa="' + encodeURIComponent(JSON.stringify(f)) + '">' +
                '<span style="font-size:1.1875rem;color:#fff;flex:1">' + esc(f.owner_name || '') + '</span>' +
                '<span style="font-size:1.1875rem;color:#fff">'        + esc(f.serial)             + '</span>' +
              '</div>'
            );
          }).join('')
        : '<div class="leo-empty">No results.</div>';

      el.querySelectorAll('.leo-gun-row').forEach(function (row) {
        row.addEventListener('click', function () {
          showGunDetail(JSON.parse(decodeURIComponent(row.dataset.fa)));
        });
      });
    });
  });

  function showGunDetail(f) {
    $('leo-gun-detail-content').innerHTML = [
      ['Gun Type', f.type], ['Gun Name', f.name], ['Serial Number', f.serial], ['Owner', f.owner_name],
    ].map(function (x) { return chip(x[0], x[1]); }).join('');
    openModal('leo-gun-detail-modal');
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     REPORTS (unchanged dynamic templates)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  function fldRow(fields) {
    return '<div class="leo-report-fld-row">' + fields.map(function (f) {
      return '<div class="leo-report-fld" style="width:' + toRem(f[1]) + '"><label>' + esc(f[0]) + '</label>' +
             '<input id="' + f[2] + '" placeholder="' + esc(f[0]) + '" autocomplete="off"></div>';
    }).join('') + '</div>';
  }

  const suspectBlock = function () {
    return '<span class="leo-report-section-label">Suspect Information</span>' +
      fldRow([['First Name',350,'r-fn'],['Last Name',350,'r-ln'],['D.O.B',185,'r-dob'],['AGE',185,'r-age'],['Gender',185,'r-gen'],['Occupation',395,'r-occ']]) +
      fldRow([['Height',350,'r-h'],['Weight',350,'r-w'],['Skin Tone',185,'r-skin'],['Hair Tone',185,'r-hair'],['Eye Color',185,'r-eye'],['Address',395,'r-addr']]);
  };

  const vehicleBlock = function (optional) {
    return '<span class="leo-report-section-label">Vehicle Information' + (optional ? ' <small style="font-size:0.875rem;opacity:.6">(Optional)</small>' : '') + '</span>' +
      fldRow([['Brand Model',350,'r-vbrand'],['Color',350,'r-vcolor'],['Plate',185,'r-vplate'],['VIN',185,'r-vvin'],['Reg Expiry',185,'r-vreg'],['Owner',395,'r-vowner']]) +
      fldRow([['Insurance Status',350,'r-vins'],['Insurance Expiry',350,'r-vinsexp']]);
  };

  const callBlock = function () {
    return '<span class="leo-report-section-label">Call Information</span>' +
      fldRow([['CALL ID',129,'r-cid'],['Nature Of Call',184,'r-cnat'],['Call Title',348,'r-ctitle'],['Location of Call',620,'r-cloc'],['Priority',185,'r-cprio'],['Status',184,'r-cstat']]);
  };

  const descArea = function (id, ph, h) {
    return '<textarea id="' + id + '" class="leo-report-textarea" style="height:' + toRem(h || 165) + '" placeholder="' + (ph || 'Description...') + '"></textarea>';
  };

  const submitBtn = function (type) {
    return '<button class="leo-report-submit" data-rtype="' + type + '">Submit</button>';
  };

  const REPORT_TEMPLATES = {
    warning:  function () { return suspectBlock() + callBlock() + '<span class="leo-report-section-label">Warning Information</span>' + fldRow([['Reason of Written Warning',620,'r-wwreason']]) + submitBtn('Written Warning'); },
    citation: function () { return suspectBlock() + vehicleBlock(true) + callBlock() + '<span class="leo-report-section-label">Citation Information</span>' + fldRow([['Charges',348,'r-charges']]) + descArea('r-desc', 'Description...') + submitBtn('Citation'); },
    arrest:   function () { return suspectBlock() + vehicleBlock(true) + fldRow([['Car Impounded?',403,'r-impound']]) + callBlock() + '<span class="leo-report-section-label">Arrest Information</span>' + fldRow([['Charges',348,'r-charges']]) + descArea('r-desc', 'Description...') + submitBtn('Arrest'); },
    incident: function () { return suspectBlock() + vehicleBlock(true) + callBlock() + descArea('r-desc', 'Description...', 180) + submitBtn('Incident Report'); },
    warrant:  function () { return suspectBlock() + vehicleBlock(true) + '<span class="leo-report-section-label">Warrant Information</span>' + fldRow([['Charges',348,'r-wcharges'],['Type',620,'r-wtype'],['Address',706,'r-waddr']]) + descArea('r-desc', 'Description...') + submitBtn('Warrant'); },
  };

  function loadReport(type) {
    const area = $('leo-report-area');
    area.innerHTML = REPORT_TEMPLATES[type] ? REPORT_TEMPLATES[type]() : '';
    area.scrollTop = 0;
    attachCharacterAutofill(area);
    const btn = area.querySelector('.leo-report-submit');
    if (btn) {
      btn.addEventListener('click', function () {
        const details = serializeReportFields(area);
        const subjectName = [details['r-fn'], details['r-ln']].filter(Boolean).join(' ').trim();
        apiFetch('/reports', {
          method: 'POST',
          body: JSON.stringify({
            serverId: Number(serverId),
            callId: Number(details['r-cid']) || null,
            type: btn.dataset.rtype,
            subjectName: subjectName || null,
            subjectPlate: details['r-vplate'] || null,
            details: details,
          }),
        })
          .then(function () { alert(btn.dataset.rtype + ' submitted successfully!'); })
          .catch(function (err) { alert('Failed to submit ' + btn.dataset.rtype + ': ' + err.message); });
      });
    }
  }

  document.querySelectorAll('.report-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.report-tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      loadReport(btn.dataset.report);
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     CALL HISTORY
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  let historyData = [];

  function fetchHistory() {
    apiFetch('/calls/' + serverId + '/history')
      .then(function (rows) {
        historyData = rows;
        renderHistory(rows);
      })
      .catch(function () {});
  }

  function renderHistory(list) {
    const el = $('leo-history-list');
    if (!list.length) { el.innerHTML = '<div class="leo-empty">No calls found.</div>'; return; }
    el.innerHTML = list.map(function (c) {
      return (
        '<div class="tbl-row">' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff;width:5rem">'   + esc(c.id)       + '</span>' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff;flex:1">'       + esc(c.nature)   + '</span>' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff;width:21.875rem">'  + esc(c.location) + '</span>' +
          '<span style="font-size:1.25rem;font-weight:700;width:7.5rem" class="' + priClass(c.priority) + '">' + esc(c.priority) + '</span>' +
          '<span style="font-size:1.25rem;font-weight:700;color:#fff">' + esc(c.units || '') + '</span>' +
        '</div>'
      );
    }).join('');
  }

  $('leo-hist-search').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderHistory(historyData.filter(function (c) {
      return String(c.id).includes(q) || c.nature.toLowerCase().includes(q) || c.location.toLowerCase().includes(q);
    }));
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     NOTEPAD
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const notepad = $('leo-notepad');
  try { const s = localStorage.getItem('cad_leo_notepad'); if (s) notepad.value = s; } catch (_) {}
  notepad.addEventListener('input', function () {
    try { localStorage.setItem('cad_leo_notepad', notepad.value); } catch (_) {}
  });

/* ── EDIT 3 ──────────────────────────────────────────────────
   ADD this function anywhere before the INIT block at the bottom.
   It syncs ERLC in-game 911 calls into the CAD database. */
 
  function syncERLCCalls() {
    apiFetch('/erlc/' + serverId + '/sync-calls', { method: 'POST', body: '{}' })
      .then(function (r) {
        if (r.synced > 0) {
          // Refresh the active-calls list if the CAD panel is visible
          if (document.getElementById('panel-cad').classList.contains('active')) {
            fetchCalls();
          }
        }
      })
      .catch(function () { /* ERLC not configured – silent */ });
  }
 
 
/* ── EDIT 4 ──────────────────────────────────────────────────
   REPLACE the existing INIT + POLLING block at the bottom of the IIFE:
 
   OLD:
     fetchCalls();
     fetchBolos();
     loadReport('warning');
     setInterval(function () {
       fetchCalls();
       fetchBolos();
     }, 12000);
 
   NEW: */
 
  fetchCalls();
  fetchBolos();
  loadReport('warning');
 
  // Sync ERLC in-game calls into CAD on load and every 30 s
  syncERLCCalls();
  setInterval(syncERLCCalls, 30000);
 
  setInterval(function () {
    fetchCalls();
    fetchBolos();
  }, 12000);
 

})();

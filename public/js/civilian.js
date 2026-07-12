/**
 * civilian.js  Viron CAD Civilian Page
 * Full API integration for characters, vehicles, and firearms.
 */

(function () {
  'use strict';

  const API_BASE = '';

  /* ── Storage helpers ────────────────────────────────────── */
  function get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }

  /* ── Auth / server context ───────────────────────────────── */
  const userId   = get('cad_user_id');
  const serverId = get('cad_active_server');

  if (!userId || !serverId) {
    window.location.href = '/server';
    return;
  }

  const token = get('cad_token');
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') };

  /* ── Helpers ────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function calcAge(dobStr) {
    if (!dobStr) return '';
    const parts = dobStr.split('/');
    const dob = parts.length === 3
      ? new Date(parts[2], parts[0] - 1, parts[1])
      : new Date(dobStr);
    if (isNaN(dob)) return '';
    return Math.floor((Date.now() - dob) / (365.25 * 24 * 3600 * 1000));
  }

  /* ── State ──────────────────────────────────────────────── */
  let characters = [];
  let vehicles   = [];
  let firearms   = [];
  let selectedCharId = null;

  /* ── API helpers ─────────────────────────────────────────── */
  function apiFetch(url, opts) {
    return fetch(API_BASE + url, Object.assign({ headers }, opts || {}))
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'API error'); });
        return r.json();
      });
  }

  /* ── Load all data ───────────────────────────────────────── */
  function loadAll() {
    Promise.all([
      apiFetch('/characters/' + serverId + '/mine'),
      apiFetch('/vehicles/' + serverId + '/mine'),
      apiFetch('/firearms/' + serverId + '/mine'),
    ])
      .then(function (results) {
        characters = results[0];
        vehicles   = results[1];
        firearms   = results[2];
        renderChars();
        renderVehiclesSubTable(null);
        renderFirearmsSubTable(null);
        renderVehicles();
        renderFirearms();
      })
      .catch(function (err) {
        Toast.error('Failed to load data: ' + err.message);
      });
  }

  /* ── Tab switching ──────────────────────────────────────── */
  const TABS = ['characters', 'vehicles', 'firearms'];

  function showTab(tab) {
    TABS.forEach(function (t) {
      const panel = $('panel-' + t);
      const btn   = $('btn-tab-' + t);
      if (panel) panel.classList.toggle('active', t === tab);
      if (btn)   btn.classList.toggle('civ-btn--active', t === tab);
    });
  }

  TABS.forEach(function (t) {
    const btn = $('btn-tab-' + t);
    if (btn) btn.addEventListener('click', function () { showTab(t); });
  });

  $('btn-back').addEventListener('click', function () {
    window.location.href = '/server';
  });

  /* ── Modal helpers ──────────────────────────────────────── */
  function openModal(id)  { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  ['modal-character', 'modal-vehicle', 'modal-firearm'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === this) closeModal(id); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    ['modal-character', 'modal-vehicle', 'modal-firearm'].forEach(function (id) {
      closeModal(id);
    });
  });

  $('btn-close-char-modal').addEventListener('click', function () { closeModal('modal-character'); });
  $('btn-close-veh-modal').addEventListener('click',  function () { closeModal('modal-vehicle'); });
  $('btn-close-fa-modal').addEventListener('click',   function () { closeModal('modal-firearm'); });

  /* ── Open modals ────────────────────────────────────────── */
  $('btn-add-character').addEventListener('click',  function () { openModal('modal-character'); });
  $('btn-add-vehicle').addEventListener('click',    function () {
    populateOwnerDropdown('veh-owner-select');
    openModal('modal-vehicle');
  });
  $('btn-add-firearm').addEventListener('click',    function () {
    populateOwnerDropdown('fa-owner-select');
    openModal('modal-firearm');
  });
  $('btn-add-vehicle-tab').addEventListener('click', function () {
    populateOwnerDropdown('veh-owner-select');
    openModal('modal-vehicle');
  });
  $('btn-add-firearm-tab').addEventListener('click', function () {
    populateOwnerDropdown('fa-owner-select');
    openModal('modal-firearm');
  });

  function populateOwnerDropdown(selectId) {
    const sel = $(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value=""> Select Character </option>';
    characters.forEach(function (c) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.first_name + ' ' + c.last_name;
      sel.appendChild(opt);
    });
    if (selectedCharId) sel.value = selectedCharId;
  }

  /* ── Render: Characters table ───────────────────────────── */
  function renderChars() {
    const list = $('chars-list');
    if (!characters.length) {
      list.innerHTML = '<div class="civ-empty">No characters yet. Click "Add Character" to create one.</div>';
      return;
    }
    list.innerHTML = characters.map(function (c, i) {
      return (
        '<div class="civ-row" data-idx="' + i + '">' +
          '<span style="width:13.75rem">'  + esc(c.first_name)              + '</span>' +
          '<span style="width:13.75rem">'  + esc(c.last_name)               + '</span>' +
          '<span style="width:11.25rem">'  + esc(c.dob || '')              + '</span>' +
          '<span style="width:6.25rem">'  + esc(calcAge(c.dob))            + '</span>' +
          '<span style="width:10.625rem">'  + esc(c.gender || '')           + '</span>' +
          '<span style="width:14.375rem">'  + esc(c.occupation || '')       + '</span>' +
          '<span class="civ-col-flex">' + esc(c.address || '')          + '</span>' +
        '</div>'
      );
    }).join('');

    list.querySelectorAll('.civ-row').forEach(function (row) {
      row.addEventListener('click', function () {
        list.querySelectorAll('.civ-row').forEach(function (r) { r.classList.remove('civ-row-selected'); });
        row.classList.add('civ-row-selected');
        const char = characters[parseInt(row.dataset.idx, 10)];
        selectedCharId = char.id;
        renderVehiclesSubTable(char.id);
        renderFirearmsSubTable(char.id);
      });
    });
  }

  /* ── Render: Vehicles sub-table ─────────────────────────── */
  function renderVehiclesSubTable(charId) {
    const list = $('chars-veh-list');
    const data = charId
      ? vehicles.filter(function (v) { return v.owner_id === charId; })
      : vehicles;

    if (!data.length) {
      list.innerHTML = '<div class="civ-empty">' +
        (charId ? 'No vehicles for this character.' : 'No vehicles registered yet.') +
        '</div>';
      return;
    }

    list.innerHTML = data.map(function (v) {
      const insClass = v.insurance_status === 'Expired' ? 'civ-ins-expired' : 'civ-ins-active';
      return (
        '<div class="civ-row">' +
          '<span style="width:15rem">'  + esc(v.owner_name || '')       + '</span>' +
          '<span style="width:10.625rem">'  + esc(v.plate)                   + '</span>' +
          '<span style="width:16.875rem">'  + esc(v.model)                   + '</span>' +
          '<span style="width:9.375rem">'  + esc(v.color || '')            + '</span>' +
          '<span style="width:14.375rem">'  + esc(v.vin || '')              + '</span>' +
          '<span style="width:11.25rem">'  + esc(v.registration_expiry || '') + '</span>' +
          '<span class="' + insClass + ' civ-col-flex">' + esc(v.insurance_status || '') + '</span>' +
        '</div>'
      );
    }).join('');
  }

  /* ── Render: Firearms sub-table ─────────────────────────── */
  function renderFirearmsSubTable(charId) {
    const list = $('chars-fa-list');
    const data = charId
      ? firearms.filter(function (f) { return f.owner_id === charId; })
      : firearms;

    if (!data.length) {
      list.innerHTML = '<div class="civ-empty">' +
        (charId ? 'No firearms for this character.' : 'No firearms registered yet.') +
        '</div>';
      return;
    }

    list.innerHTML = data.map(function (f) {
      return (
        '<div class="civ-row">' +
          '<span style="width:16.25rem">'  + esc(f.owner_name || '') + '</span>' +
          '<span style="width:22.5rem">'  + esc(f.serial)            + '</span>' +
          '<span style="width:22.5rem">'  + esc(f.name || '')       + '</span>' +
          '<span class="civ-col-flex">' + esc(f.type)              + '</span>' +
        '</div>'
      );
    }).join('');
  }

  /* ── Render: Vehicles tab ───────────────────────────────── */
  function renderVehicles() {
    const list = $('vehicles-list');
    if (!vehicles.length) {
      list.innerHTML = '<div class="civ-empty">No vehicles registered yet.</div>';
      return;
    }
    list.innerHTML = vehicles.map(function (v) {
      const insClass = v.insurance_status === 'Expired' ? 'civ-ins-expired' : 'civ-ins-active';
      return (
        '<div class="civ-row">' +
          '<span style="width:15rem">'  + esc(v.owner_name || '')          + '</span>' +
          '<span style="width:10.625rem">'  + esc(v.plate)                      + '</span>' +
          '<span style="width:16.875rem">'  + esc(v.model)                      + '</span>' +
          '<span style="width:9.375rem">'  + esc(v.color || '')               + '</span>' +
          '<span style="width:13.75rem">'  + esc(v.vin || '')                 + '</span>' +
          '<span style="width:10.625rem">'  + esc(v.registration_expiry || '') + '</span>' +
          '<span class="' + insClass + '" style="width:11.25rem">' + esc(v.insurance_status || '') + '</span>' +
          '<span class="civ-col-flex">' + esc(v.insurance_expiry || '')    + '</span>' +
        '</div>'
      );
    }).join('');
  }

  /* ── Render: Firearms tab ───────────────────────────────── */
  function renderFirearms() {
    const list = $('firearms-list');
    if (!firearms.length) {
      list.innerHTML = '<div class="civ-empty">No firearms registered yet.</div>';
      return;
    }
    list.innerHTML = firearms.map(function (f) {
      return (
        '<div class="civ-row">' +
          '<span style="width:16.25rem">'  + esc(f.owner_name || '') + '</span>' +
          '<span style="width:22.5rem">'  + esc(f.serial)            + '</span>' +
          '<span style="width:22.5rem">'  + esc(f.name || '')       + '</span>' +
          '<span class="civ-col-flex">' + esc(f.type)              + '</span>' +
        '</div>'
      );
    }).join('');
  }

  /* ── Clear form fields ──────────────────────────────────── */
  function clearFields(ids) {
    ids.forEach(function (id) {
      const el = $(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
  }

  /* ── Submit: Create Character ───────────────────────────── */
  $('btn-submit-char').addEventListener('click', function () {
    const fn  = $('char-fn').value.trim();
    const ln  = $('char-ln').value.trim();
    const dob = $('char-dob').value.trim();
    if (!fn || !ln || !dob) {
      Toast.warning('First name, last name, and D.O.B. are required.');
      return;
    }

    apiFetch('/characters', {
      method: 'POST',
      body: JSON.stringify({
        serverId:   Number(serverId),
        firstName:  fn,
        lastName:   ln,
        dob:        dob,
        gender:     $('char-gender').value.trim() || null,
        occupation: $('char-occ').value.trim()    || null,
        height:     $('char-height').value.trim() || null,
        weight:     $('char-weight').value.trim() || null,
        skinTone:   $('char-skin').value.trim()   || null,
        hairTone:   $('char-hair').value.trim()   || null,
        eyeColor:   $('char-eye').value.trim()    || null,
        address:    $('char-addr').value.trim()   || null,
      }),
    })
      .then(function (char) {
        characters.push(char);
        renderChars();
        closeModal('modal-character');
        clearFields(['char-fn','char-ln','char-dob','char-age','char-gender','char-occ',
                     'char-height','char-weight','char-skin','char-hair','char-eye','char-addr']);
        Toast.success('Character created successfully!');
      })
      .catch(function (err) { Toast.error(err.message); });
  });

  /* ── Submit: Add Vehicle ────────────────────────────────── */
  $('btn-submit-veh').addEventListener('click', function () {
    const plate   = $('veh-plate').value.trim();
    const model   = $('veh-model').value.trim();
    const ownerId = $('veh-owner-select') ? $('veh-owner-select').value : '';
    if (!plate || !model) {
      Toast.warning('Plate and model are required.');
      return;
    }

    apiFetch('/vehicles', {
      method: 'POST',
      body: JSON.stringify({
        serverId:            Number(serverId),
        ownerId:             ownerId ? Number(ownerId) : null,
        plate:               plate,
        vin:                 $('veh-vin').value.trim()    || null,
        model:               model,
        color:               $('veh-color').value.trim()  || null,
        registrationExpiry:  $('veh-reg').value.trim()    || null,
        insuranceStatus:     $('veh-ins').value           || 'Active',
        insuranceExpiry:     $('veh-insexp').value.trim() || null,
      }),
    })
      .then(function (veh) {
        vehicles.push(veh);
        renderVehicles();
        renderVehiclesSubTable(selectedCharId);
        closeModal('modal-vehicle');
        clearFields(['veh-plate','veh-model','veh-color','veh-vin','veh-reg','veh-insexp']);
        Toast.success('Vehicle added successfully!');
      })
      .catch(function (err) { Toast.error(err.message); });
  });

  /* ── Submit: Register Firearm ───────────────────────────── */
  $('btn-submit-fa').addEventListener('click', function () {
    const serial  = $('fa-serial').value.trim();
    const type    = $('fa-type').value.trim();
    const ownerId = $('fa-owner-select') ? $('fa-owner-select').value : '';
    if (!serial || !type) {
      Toast.warning('Serial number and type are required.');
      return;
    }

    apiFetch('/firearms', {
      method: 'POST',
      body: JSON.stringify({
        serverId: Number(serverId),
        ownerId:  ownerId ? Number(ownerId) : null,
        serial:   serial,
        name:     $('fa-name').value.trim()  || null,
        type:     type,
      }),
    })
      .then(function (fa) {
        firearms.push(fa);
        renderFirearms();
        renderFirearmsSubTable(selectedCharId);
        closeModal('modal-firearm');
        clearFields(['fa-serial','fa-name','fa-type']);
        Toast.success('Firearm registered successfully!');
      })
      .catch(function (err) { Toast.error(err.message); });
  });

  /* ── Init ───────────────────────────────────────────────── */
  loadAll();

})();
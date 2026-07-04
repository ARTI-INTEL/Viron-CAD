/**
 * dashboard.js  Ultimate CAD Dashboard
 * Loads real server list from API, handles create + join server.
 */

(function () {
  'use strict';

  const API_BASE = '';

  /* ── Storage helpers ─────────────────────────────────────── */
  function get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function set(key, val) { try { localStorage.setItem(key, val); } catch (_) {} }

  /* ── Auth guard ─────────────────────────────────────────── */
  const userId   = get('cad_user_id');
  const username = get('cad_username') || 'Unit';

  if (!userId) {
    window.location.href = 'index.html';
    return;
  }

  /* ── Element references ─────────────────────────────────── */
  const greeting       = document.getElementById('db-nav-greeting');
  const btnSettings    = document.getElementById('btn-settings');
  const searchInput    = document.getElementById('server-search');
  const serversList    = document.getElementById('servers-list');
  const btnCreate      = document.getElementById('btn-create-server');
  const modal          = document.getElementById('modal-create-server');
  const btnModalClose  = document.getElementById('btn-modal-close');
  const btnModalCreate = document.getElementById('btn-modal-create');
  const fieldName      = document.getElementById('field-server-name');
  const fieldCode      = document.getElementById('field-join-code');
  const fieldDesc      = document.getElementById('field-description');
  const fieldDiscord   = document.getElementById('field-discord-server');

  /* ── State ───────────────────────────────────────────────── */
  let servers     = [];
  let filterQuery = '';
  let discordGuildsLoaded = false;

  /* ── Greeting ────────────────────────────────────────────── */
  greeting.textContent = 'Welcome to Ultimate CAD, ' + username;

  function populateDiscordServers(guilds) {
    fieldDiscord.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = guilds.length ? 'Select Discord Server' : 'No owned Discord servers found';
    fieldDiscord.appendChild(placeholder);

    guilds.forEach(function (guild) {
      var opt = document.createElement('option');
      opt.value = guild.id;
      opt.textContent = guild.name;
      fieldDiscord.appendChild(opt);
    });
  }

  function loadDiscordServers() {
    if (discordGuildsLoaded) return Promise.resolve();

    fieldDiscord.disabled = true;
    populateDiscordServers([]);
    fieldDiscord.options[0].textContent = 'Loading Discord servers...';

    return fetch(API_BASE + '/auth/discord/owner-guilds', {
      headers: { 'Authorization': 'Bearer ' + (get('cad_token') || '') },
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Failed to load Discord servers'); });
        return r.json();
      })
      .then(function (guilds) {
        populateDiscordServers(Array.isArray(guilds) ? guilds : []);
        discordGuildsLoaded = true;
      })
      .catch(function () {
        populateDiscordServers([]);
        fieldDiscord.options[0].textContent = 'Could not load Discord servers';
      })
      .finally(function () {
        fieldDiscord.disabled = false;
      });
  }

  /* ── Load servers from API ───────────────────────────────── */
  function loadServers() {
    fetch(API_BASE + '/servers/my-servers', {
      headers: { 'Authorization': 'Bearer ' + (get('cad_token') || '') },
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        servers = rows.map(function (s) {
          return {
            id:      s.idserver,
            name:    s.name,
            members: s.member_count || 0,           // member count from API
            owner:   s.owner_id === Number(userId) ? username : '',
            role:    s.owner_id === Number(userId) ? 'Owner' : 'Member',
          };
        });
        applyFilter();
      })
      .catch(function () {
        // Offline fallback
        renderServers(servers);
      });
  }

  /* ── Render helpers ─────────────────────────────────────── */
  function renderServers(list) {
    serversList.innerHTML = '';

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'db-empty';
      empty.textContent = 'No servers found. Create one or join with a code!';
      serversList.appendChild(empty);
      return;
    }

    list.forEach(function (srv, idx) {
      const row = document.createElement('div');
      row.className = 'db-server-row';
      row.style.animationDelay = (idx * 45) + 'ms';
      row.dataset.serverId = srv.id;

      const nameEl = document.createElement('span');
      nameEl.className = 'db-server-name';
      nameEl.textContent = srv.name;

      const membersEl = document.createElement('span');
      membersEl.className = 'db-server-members';
      membersEl.textContent = srv.members || '';

      const ownerEl = document.createElement('span');
      ownerEl.className = 'db-server-owner';
      ownerEl.textContent = '(' + (srv.role || 'Member') + ') ' + srv.owner;

      row.appendChild(nameEl);
      row.appendChild(membersEl);
      row.appendChild(ownerEl);

      row.addEventListener('click', function () {
        set('cad_active_server', srv.id);
        set('cad_active_server_name', srv.name);
        window.location.href = 'server-page.html';
      });

      serversList.appendChild(row);
    });
  }

  function applyFilter() {
    const q = filterQuery.toLowerCase().trim();
    if (!q) { renderServers(servers); return; }
    const filtered = servers.filter(function (s) {
      return s.name.toLowerCase().includes(q);
    });
    renderServers(filtered);
  }

  loadServers();

  /* ── Search ─────────────────────────────────────────────── */
  searchInput.addEventListener('input', function () {
    filterQuery = searchInput.value;
    applyFilter();
  });

  /* ── Settings ───────────────────────────────────────────── */
  btnSettings.addEventListener('click', function () {
    window.location.href = 'settings.html';
  });

  /* ── Modal: open / close ────────────────────────────────── */
  function openModal() {
    modal.classList.add('active');
    fieldCode.value = generateJoinCode();
    loadDiscordServers();

    // Switch modal Create button to handle tabs (Create vs Join)
    document.getElementById('btn-modal-create').textContent = 'Create';
    document.getElementById('btn-modal-create').dataset.mode = 'create';

    fieldName.focus();
  }

  function closeModal() {
    modal.classList.remove('active');
    clearModalFields();
    clearValidation();
  }

  btnCreate.addEventListener('click', openModal);
  btnModalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
  });

  /* ── Inject a "Join Server" tab inside the modal ─────────── */
  (function buildModalTabs() {
    const box = modal.querySelector('.db-modal-box');
    if (!box) return;

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:1rem;';

    const tabCreate = document.createElement('button');
    tabCreate.textContent = 'Create Server';
    tabCreate.id = 'tab-create';
    tabCreate.style.cssText = getTabStyle(true);

    const tabJoin = document.createElement('button');
    tabJoin.textContent = 'Join Server';
    tabJoin.id = 'tab-join';
    tabJoin.style.cssText = getTabStyle(false);

    tabBar.appendChild(tabCreate);
    tabBar.appendChild(tabJoin);
    box.insertBefore(tabBar, box.firstChild.nextSibling); // after close btn

    // Join code row (hidden by default)
    const joinRow = document.createElement('div');
    joinRow.id = 'join-row';
    joinRow.style.cssText = 'display:none;margin-top:0.5rem;';
    joinRow.innerHTML = `
      <div class="db-field" style="flex:1;">
        <label class="db-field-label" for="field-join-existing">Join Code</label>
        <input class="db-field-input db-field-input--mono" id="field-join-existing"
          placeholder="Enter 8-character code" maxlength="12" autocomplete="off">
      </div>`;
    box.appendChild(joinRow);

    function getTabStyle(active) {
      return `height:2.25rem;padding:0 1.25rem;border:none;border-radius:0.625rem;cursor:pointer;
              font-family:Inter,sans-serif;font-size:0.875rem;font-weight:700;
              background:${active ? '#2954c3' : '#444'};color:#fff;transition:background .15s;`;
    }

    tabCreate.addEventListener('click', function () {
      tabCreate.style.cssText = getTabStyle(true);
      tabJoin.style.cssText   = getTabStyle(false);
      document.querySelector('.db-modal-row').style.display = '';
      document.querySelector('.db-modal-row.db-modal-row--bottom').style.display = '';
      joinRow.style.display   = 'none';
      btnModalCreate.textContent   = 'Create';
      btnModalCreate.dataset.mode  = 'create';
    });

    tabJoin.addEventListener('click', function () {
      tabCreate.style.cssText = getTabStyle(false);
      tabJoin.style.cssText   = getTabStyle(true);
      document.querySelector('.db-modal-row').style.display = 'none';
      document.querySelector('.db-modal-row.db-modal-row--bottom').style.display = 'none';
      joinRow.style.display   = '';
      btnModalCreate.textContent   = 'Join';
      btnModalCreate.dataset.mode  = 'join';
    });
  })();

  /* ── Modal: create / join ────────────────────────────────── */
  btnModalCreate.addEventListener('click', function () {
    if (btnModalCreate.dataset.mode === 'join') {
      doJoinServer();
    } else {
      doCreateServer();
    }
  });

  function doCreateServer() {
    clearValidation();
    const name    = fieldName.value.trim();
    const code    = fieldCode.value.trim().toUpperCase() || generateJoinCode();
    const desc    = fieldDesc.value.trim();
    const discordId = fieldDiscord.value || null;

    if (!name) { setError(fieldName); return; }

    btnModalCreate.textContent = 'Creating…';
    btnModalCreate.disabled    = true;

    fetch(API_BASE + '/servers/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (get('cad_token') || ''),
      },
      body: JSON.stringify({ name, joinCode: code, description: desc, discordId: discordId }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error); });
        return r.json();
      })
      .then(function (server) {
        closeModal();
        set('cad_active_server', server.idserver);
        set('cad_active_server_name', server.name);
        loadServers();
      })
      .catch(function (err) {
        alert(err.message || 'Failed to create server.');
      })
      .finally(function () {
        btnModalCreate.textContent = 'Create';
        btnModalCreate.disabled    = false;
      });
  }

  function doJoinServer() {
    const codeInput = document.getElementById('field-join-existing');
    const code      = codeInput ? codeInput.value.trim().toUpperCase() : '';
    if (!code) { if (codeInput) codeInput.focus(); return; }

    btnModalCreate.textContent = 'Joining…';
    btnModalCreate.disabled    = true;

    fetch(API_BASE + '/servers/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (get('cad_token') || ''),
      },
      body: JSON.stringify({ joinCode: code }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error); });
        return r.json();
      })
      .then(function (server) {
        closeModal();
        set('cad_active_server', server.idserver);
        set('cad_active_server_name', server.name);
        loadServers();
      })
      .catch(function (err) {
        alert(err.message || 'Invalid join code.');
      })
      .finally(function () {
        btnModalCreate.textContent = 'Join';
        btnModalCreate.disabled    = false;
      });
  }

  /* ── Utilities ───────────────────────────────────────────── */
  function generateJoinCode(len) {
    len = len || 8;
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var code = '';
    for (var i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function clearModalFields() {
    fieldName.value    = '';
    fieldCode.value    = '';
    fieldDesc.value    = '';
    fieldDiscord.value = '';
    const ji = document.getElementById('field-join-existing');
    if (ji) ji.value = '';
  }

  function clearValidation() {
    [fieldName, fieldCode, fieldDesc].forEach(function (el) {
      el.closest('.db-field') && el.closest('.db-field').classList.remove('has-error');
    });
  }

  function setError(inputEl) {
    const p = inputEl.closest('.db-field');
    if (p) p.classList.add('has-error');
  }

  /* ── Join-code auto-format ───────────────────────────────── */
  fieldCode.addEventListener('input', function () {
    fieldCode.value = fieldCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

})();

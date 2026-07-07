/**
 * settings.js  Ultimate CAD Account Settings Page
 * Includes Roblox account linking via OAuth.
 */

(function () {
  'use strict';

  const API_BASE = '';

  function get(key)      { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function set(key, val) { try { localStorage.setItem(key, val);   } catch (_) {} }
  function remove(key)   { try { localStorage.removeItem(key);     } catch (_) {} }

  const userId    = get('cad_user_id');
  const username  = get('cad_username') || 'Unknown User';
  const discordId = get('cad_discord_id') || '';

  if (!userId) { window.location.href = '/'; return; }

  function apiFetch(url, opts) {
    return fetch(API_BASE + url, Object.assign({
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (get('cad_token') || '') },
    }, opts || {}))
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'API error'); });
        return r.json();
      });
  }

  /* ── Element refs ────────────────────────────────────────── */
  const navTitle        = document.getElementById('st-nav-title');
  const btnDashboard    = document.getElementById('btn-dashboard');
  const cellUsername    = document.getElementById('cell-username');
  const cellRole        = document.getElementById('cell-role');
  const cellServerCount = document.getElementById('cell-server-count');
  const cellJoinDate    = document.getElementById('cell-join-date');
  const cellDiscordId   = document.getElementById('cell-discord-id');
  const inputUsername   = document.getElementById('input-username');
  const inputEmail      = document.getElementById('input-email');
  const inputDiscordId  = document.getElementById('input-discord-id');
  const inputJoinDate   = document.getElementById('input-join-date');
  const btnSave         = document.getElementById('btn-save-account');
  const errorMsg        = document.getElementById('account-error');
  const successMsg      = document.getElementById('account-success');
  const serversList     = document.getElementById('servers-list');
  const btnLeaveAll     = document.getElementById('btn-leave-all');
  const btnDeleteAcct   = document.getElementById('btn-delete-account');

  // Roblox
  const robloxCard    = document.getElementById('roblox-card');
  const robloxSubText = document.getElementById('roblox-sub-text');
  const btnRoblox     = document.getElementById('btn-roblox-link');
  const robloxNotif   = document.getElementById('roblox-notif');

  // Confirm modal
  const modalConfirm    = document.getElementById('modal-confirm');
  const confirmTitle    = document.getElementById('confirm-title');
  const confirmDesc     = document.getElementById('confirm-desc');
  const btnConfirmYes   = document.getElementById('btn-confirm-yes');
  const btnConfirmNo    = document.getElementById('btn-confirm-no');
  const btnConfirmClose = document.getElementById('btn-confirm-close');
  let pendingConfirmAction = null;

  // Verification modal
  const modalVerify      = document.getElementById('modal-verify');
  const verifyModalTitle = document.getElementById('verify-modal-title');
  const verifyStep1      = document.getElementById('verify-step-1');
  const verifyStep1Error = document.getElementById('verify-step-1-error');
  const verifyStep2      = document.getElementById('verify-step-2');
  const verifyStep2Desc  = document.getElementById('verify-step-2-desc');
  const verifyStep2Error = document.getElementById('verify-step-2-error');
  const inputVerifyCode  = document.getElementById('input-verify-code');
  const btnSendCode      = document.getElementById('btn-send-code');
  const btnSubmitCode    = document.getElementById('btn-submit-verify-code');
  const btnVerifyClose   = document.getElementById('btn-verify-close');
  const btnVerifyCancel1 = document.getElementById('btn-verify-cancel-1');
  const btnVerifyCancel2 = document.getElementById('btn-verify-cancel-2');
  let pendingVerifyAction   = null;
  let pendingVerifyCallback = null;

  let serverData = [];

  /* ── Utility ─────────────────────────────────────────────── */
  function formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Navbar ──────────────────────────────────────────────── */
  navTitle.textContent = 'Welcome to Ultimate CAD, ' + username;

  function populateInfoRow(user) {
    cellUsername.textContent  = user.username || username;
    cellRole.textContent      = 'Member';
    cellDiscordId.textContent = user.discord_id || discordId;
    cellJoinDate.textContent  = formatDate(user.created_at);
  }

  /* ── Load user ───────────────────────────────────────────── */
  (function loadUser() {
    const localUser = { username, discord_id: discordId, created_at: get('cad_join_date') };
    populateInfoRow(localUser);
    inputUsername.value  = localUser.username;
    inputDiscordId.value = localUser.discord_id;
    inputJoinDate.value  = formatDate(localUser.created_at);

    apiFetch('/users/me')
      .then(function (user) {
        if (!user) return;
        populateInfoRow(Object.assign({}, localUser, user));
        inputDiscordId.value = user.discord_id || discordId;
        inputJoinDate.value  = formatDate(user.created_at);
        if (user.email) inputEmail.value = user.email;
        if (user.created_at) set('cad_join_date', user.created_at);
      })
      .catch(function () {});
  })();

  /* ── Load servers ────────────────────────────────────────── */
  function loadServers() {
    serversList.innerHTML = '<div class="st-empty-servers" style="color:rgba(255,255,255,0.3);">Loading…</div>';

    apiFetch('/servers/my-servers')
      .then(function (rows) {
        serverData = rows || [];
        renderServers(serverData);
        cellServerCount.textContent = serverData.length;
      })
      .catch(function () {
        try { serverData = JSON.parse(localStorage.getItem('cad_servers') || '[]'); } catch (_) { serverData = []; }
        renderServers(serverData);
        cellServerCount.textContent = serverData.length;
      });
  }

  loadServers();

  function renderServers(list) {
    serversList.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className   = 'st-empty-servers';
      empty.textContent = 'No server memberships found.';
      serversList.appendChild(empty);
      return;
    }

    list.forEach(function (srv, idx) {
      const row     = document.createElement('div');
      row.className = 'st-srv-row';
      row.style.animationDelay = (idx * 40) + 'ms';

      const srvId    = srv.id || srv.idserver;
      const srvName  = srv.name || '';
      const srvRole  = srv.role || 'Member';
      const joinedAt = srv.joined_at || srv.joinedAt || null;
      const roleLower = srvRole.toLowerCase();
      const badgeClass = roleLower === 'owner' ? 'st-role-badge--owner'
                       : roleLower === 'admin'  ? 'st-role-badge--admin'
                       : 'st-role-badge--member';

      const leaveBtn = roleLower === 'owner'
        ? '<span style="font-size:0.875rem;color:rgba(255,255,255,0.3);font-weight:600;">Owner</span>'
        : '<button class="st-leave-btn" data-server-id="' + esc(String(srvId)) + '" data-server-name="' + esc(srvName) + '">Leave</button>';

      row.innerHTML = [
        '<span class="st-srv-cell" style="--col-w:30rem">'                         + esc(srvName)              + '</span>',
        '<span class="st-srv-cell st-srv-cell--members" style="--col-w:12.5rem">'  + (srv.member_count || '') + '</span>',
        '<span class="st-srv-cell st-srv-cell--role" style="--col-w:12.5rem">',
          '<span class="st-role-badge ' + badgeClass + '">' + esc(srvRole) + '</span>',
        '</span>',
        '<span class="st-srv-cell st-srv-cell--date" style="--col-w:15rem">' + formatDate(joinedAt) + '</span>',
        '<span class="st-srv-cell" style="--col-w:10rem">' + leaveBtn + '</span>',
      ].join('');

      serversList.appendChild(row);
    });
  }

  serversList.addEventListener('click', function (e) {
    const btn = e.target.closest('.st-leave-btn');
    if (!btn) return;
    const serverName = btn.getAttribute('data-server-name');
    const srvId      = btn.getAttribute('data-server-id');
    startVerification(
      'Leave "' + serverName + '"?',
      'leave_server_' + srvId,
      function () { doLeaveServer(srvId, serverName); }
    );
  });

  function doLeaveServer(srvId, serverName) {
    apiFetch('/servers/' + srvId + '/leave', { method: 'DELETE' })
      .then(function () {
        serverData = serverData.filter(function (s) {
          return String(s.id || s.idserver) !== String(srvId);
        });
        renderServers(serverData);
        cellServerCount.textContent = serverData.length;
        if (typeof Toast !== 'undefined') Toast.success('Left server successfully.');
      })
      .catch(function (err) {
        alert('Could not leave server: ' + err.message);
        loadServers();
      });
  }

  /* ── Save account ────────────────────────────────────────── */
  btnSave.addEventListener('click', function () {
    errorMsg.textContent   = '';
    successMsg.textContent = '';

    const newName  = inputUsername.value.trim();
    const newEmail = inputEmail ? inputEmail.value.trim() : '';

    if (!newName) { errorMsg.textContent = 'Username cannot be empty.'; return; }
    if (newName.length < 2 || newName.length > 32) { errorMsg.textContent = 'Username must be 2–32 characters.'; return; }
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { errorMsg.textContent = 'Invalid email format.'; return; }

    btnSave.classList.add('st-loading');
    btnSave.textContent = 'Saving…';

    set('cad_username', newName);
    navTitle.textContent     = 'Welcome to Ultimate CAD, ' + newName;
    cellUsername.textContent = newName;

    const saves = [
      apiFetch('/users/update', { method: 'PATCH', body: JSON.stringify({ username: newName }) }).catch(function () {}),
    ];

    if (newEmail) {
      saves.push(apiFetch('/users/email', { method: 'PATCH', body: JSON.stringify({ email: newEmail }) }).catch(function () {}));
    }

    Promise.all(saves).then(function () {
      btnSave.classList.remove('st-loading');
      btnSave.textContent    = 'Save Changes';
      successMsg.textContent = 'Settings saved.';
      if (typeof Toast !== 'undefined') Toast.success('Settings saved.');
      setTimeout(function () { successMsg.textContent = ''; }, 3000);
    });
  });

  /* ── Roblox OAuth linking ─────────────────────────────────── */

  // Check for OAuth return params in URL
  (function handleRobloxReturn() {
    const params = new URLSearchParams(window.location.search);
    const robloxSuccess  = params.get('roblox_success');
    const robloxUsername = params.get('roblox_username');
    const robloxError    = params.get('roblox_error');

    if (robloxSuccess) {
      const name = robloxUsername ? decodeURIComponent(robloxUsername) : 'your account';
      showRobloxNotif('✓ Roblox account linked: @' + name, 'success');
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (robloxError) {
      const errorMap = {
        denied:          'Roblox authorization was canceled.',
        missing_params:  'OAuth parameters were missing.',
        invalid_state:   'Session expired. Please try again.',
        token_failed:    'Could not exchange the authorization code.',
        userinfo_failed: 'Could not fetch your Roblox profile.',
        already_linked:  'This Roblox account is already linked to another CAD user.',
        server_error:    'An unexpected error occurred. Please try again.',
      };
      showRobloxNotif('✗ ' + (errorMap[robloxError] || 'Roblox linking failed.'), 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  })();

  function showRobloxNotif(msg, type) {
    if (!robloxNotif) return;
    robloxNotif.textContent = msg;
    robloxNotif.className   = 'roblox-notif roblox-notif--' + type;
    robloxNotif.style.display = '';
    setTimeout(function () { robloxNotif.style.display = 'none'; }, 6000);
  }

  // Load current Roblox link status
  (function loadRobloxStatus() {
    if (!btnRoblox) return;

    apiFetch('/auth/roblox/me')
      .then(function (data) {
        if (data && data.roblox_username) {
          setRobloxLinked(data.roblox_username);
        } else {
          setRobloxUnlinked();
        }
      })
      .catch(function () { setRobloxUnlinked(); });
  })();

  function setRobloxLinked(robloxUsername) {
    if (!robloxSubText || !btnRoblox) return;
    robloxSubText.innerHTML = 'Linked as <span class="roblox-card__username">@' + esc(robloxUsername) + '</span>';
    btnRoblox.textContent   = 'Unlink';
    btnRoblox.className     = 'roblox-link-btn roblox-link-btn--unlink';
    btnRoblox.onclick       = doRobloxUnlink;
  }

  function setRobloxUnlinked() {
    if (!robloxSubText || !btnRoblox) return;
    robloxSubText.textContent = 'Link your Roblox account to show your username in the CAD and enable ERLC integration.';
    btnRoblox.textContent     = 'Link Roblox';
    btnRoblox.className       = 'roblox-link-btn roblox-link-btn--link';
    btnRoblox.onclick         = doRobloxLink;
  }

  function doRobloxLink() {
    // Redirect to Roblox OAuth — userId passed as query param for the callback
    window.location.href = '/auth/roblox/link?token=' + encodeURIComponent(get('cad_token') || '');
  }

  function doRobloxUnlink() {
    if (!confirm('Are you sure you want to unlink your Roblox account?')) return;

    apiFetch('/auth/roblox/unlink', { method: 'DELETE' })
      .then(function () {
        setRobloxUnlinked();
        showRobloxNotif('Roblox account unlinked.', 'success');
        if (typeof Toast !== 'undefined') Toast.success('Roblox account unlinked.');
      })
      .catch(function (err) {
        showRobloxNotif('✗ ' + err.message, 'error');
      });
  }

  /* ── Session Security ────────────────────────────────────── */
  const sessionsList          = document.getElementById('sessions-list');
  const sessionsError         = document.getElementById('sessions-error');
  const sessionsSuccess       = document.getElementById('sessions-success');
  const btnLogoutEverywhere   = document.getElementById('btn-logout-everywhere');

  function loadSessions() {
    sessionsList.innerHTML = '<div class="st-empty-servers" style="color:rgba(255,255,255,0.3);">Loading sessions…</div>';

    apiFetch('/auth/sessions')
      .then(function (sessions) {
        renderSessions(sessions || []);
      })
      .catch(function () {
        sessionsList.innerHTML = '<div class="st-empty-servers">Could not load sessions.</div>';
      });
  }

  loadSessions();

  function renderSessions(sessions) {
    sessionsList.innerHTML = '';

    if (!sessions.length) {
      var empty = document.createElement('div');
      empty.className = 'st-empty-servers';
      empty.textContent = 'No active sessions.';
      sessionsList.appendChild(empty);
      return;
    }

    sessions.forEach(function (s, idx) {
      var row = document.createElement('div');
      row.className = 'st-srv-row'; // Reuse existing row style
      row.style.animationDelay = (idx * 35) + 'ms';

      var deviceInfo = s.userAgent || 'Unknown device';
      // Trim long user-agent strings to just the browser/platform part
      if (deviceInfo.length > 60) {
        var parts = deviceInfo.split(')');
        if (parts.length > 1) {
          deviceInfo = parts[0].split('(').pop() || deviceInfo;
        }
      }
      if (deviceInfo.length > 55) deviceInfo = deviceInfo.slice(0, 52) + '…';

      var lastActive = s.lastUsedAt ? formatDate(s.lastUsedAt) : (s.createdAt ? formatDate(s.createdAt) : '–');

      var statusHtml = s.isCurrent
        ? '<span class="st-ssn-badge st-ssn-badge--current">Current</span>'
        : s.revoked
          ? '<span class="st-ssn-badge st-ssn-badge--revoked">Revoked</span>'
          : '<span class="st-ssn-badge st-ssn-badge--active">Active</span>';

      var revokeBtn = (!s.isCurrent && !s.revoked)
        ? '<button class="st-leave-btn st-ssn-revoke" data-session-id="' + esc(String(s.id)) + '" style="font-size:0.75rem;">Revoke</button>'
        : '';

      row.innerHTML =
        '<span class="st-ssn-cell" style="--col-w:22rem;font-size:1rem;">' + esc(deviceInfo) + '</span>' +
        '<span class="st-ssn-cell" style="--col-w:12rem;font-size:0.9375rem;color:rgba(255,255,255,0.5);">' + esc(s.ipAddress || '–') + '</span>' +
        '<span class="st-ssn-cell" style="--col-w:13rem;font-size:0.9375rem;color:rgba(255,255,255,0.5);">' + esc(lastActive) + '</span>' +
        '<span class="st-ssn-cell" style="--col-w:10rem;">' + statusHtml + '</span>' +
        '<span class="st-ssn-cell" style="--col-w:9rem;">' + revokeBtn + '</span>';

      sessionsList.appendChild(row);
    });
  }

  // Revoke individual session via delegation
  sessionsList.addEventListener('click', function (e) {
    var btn = e.target.closest('.st-ssn-revoke');
    if (!btn) return;
    var sessionId = btn.getAttribute('data-session-id');

    apiFetch('/auth/sessions/' + sessionId, { method: 'DELETE' })
      .then(function () {
        loadSessions();
        sessionsSuccess.textContent = 'Session revoked.';
        sessionsError.textContent = '';
        if (typeof Toast !== 'undefined') Toast.success('Session revoked.');
        setTimeout(function () { sessionsSuccess.textContent = ''; }, 3000);
      })
      .catch(function (err) {
        sessionsError.textContent = err.message;
        sessionsSuccess.textContent = '';
      });
  });

  // Log Out Everywhere Else
  btnLogoutEverywhere.addEventListener('click', function () {
    if (!confirm('Revoke all other active sessions? Devices logged in with those sessions will need to sign in again.')) return;

    btnLogoutEverywhere.textContent = 'Revoking…';
    btnLogoutEverywhere.disabled = true;

    apiFetch('/auth/sessions', { method: 'DELETE' })
      .then(function () {
        loadSessions();
        sessionsSuccess.textContent = 'All other sessions revoked.';
        sessionsError.textContent = '';
        if (typeof Toast !== 'undefined') Toast.success('All other sessions revoked.');
        setTimeout(function () { sessionsSuccess.textContent = ''; }, 4000);
      })
      .catch(function (err) {
        sessionsError.textContent = err.message;
        sessionsSuccess.textContent = '';
      })
      .finally(function () {
        btnLogoutEverywhere.textContent = 'Log Out Everywhere Else';
        btnLogoutEverywhere.disabled = false;
      });
  });

    /* ════════════════════════════════════════════════════════════
     KEYBINDS (PTT + Bodycam)
  ════════════════════════════════════════════════════════════ */

  var PTT_KEY_STORAGE = 'cad_radio_ptt_key';
  var BC_KEY_STORAGE  = 'cad_bodycam_key';

  var kbPttBox       = document.getElementById('kb-ptt-box');
  var kbPttDisplay   = document.getElementById('kb-ptt-display');
  var kbBodycamBox   = document.getElementById('kb-bodycam-box');
  var kbBodycamDisplay = document.getElementById('kb-bodycam-display');
  var kbSuccessMsg   = document.getElementById('kb-settings-success');

  function getKeyDisplay(key) {
    if (key === ' ') return 'Space';
    if (key === 'Control') return 'Ctrl';
    if (key === 'Shift') return 'Shift';
    if (key === 'Alt') return 'Alt';
    return key;
  }

  // Load saved keybinds
  (function loadKeybinds() {
    var savedPtt = localStorage.getItem(PTT_KEY_STORAGE);
    if (savedPtt && kbPttDisplay) kbPttDisplay.textContent = getKeyDisplay(savedPtt);

    var savedBc = localStorage.getItem(BC_KEY_STORAGE);
    if (savedBc && kbBodycamDisplay) kbBodycamDisplay.textContent = getKeyDisplay(savedBc);
  })();

  // Generic keybind capture helper
  function setupKeybindCapture(box, display, storageKey, defaultValue, onSave) {
    if (!box) return;

    var isCapturing = false;

    box.addEventListener('click', function () {
      isCapturing = true;
      box.classList.add('cr-keybind-box--capturing');
      display.textContent = 'Press a key...';
    });

    box.addEventListener('keydown', function (e) {
      if (!isCapturing) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        isCapturing = false;
        box.classList.remove('cr-keybind-box--capturing');
        var savedKey = localStorage.getItem(storageKey);
        display.textContent = savedKey ? getKeyDisplay(savedKey) : defaultValue;
        return;
      }

      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      var capturedKey = e.key;
      if (capturedKey === ' ') capturedKey = ' ';

      localStorage.setItem(storageKey, capturedKey);
      display.textContent = getKeyDisplay(capturedKey);
      box.classList.remove('cr-keybind-box--capturing');
      isCapturing = false;

      if (kbSuccessMsg) {
        kbSuccessMsg.textContent = getKeyDisplay(capturedKey) + ' keybind saved';
        setTimeout(function () { kbSuccessMsg.textContent = ''; }, 3000);
      }

      if (typeof onSave === 'function') onSave(capturedKey);
    });

    box.addEventListener('blur', function () {
      if (isCapturing) {
        isCapturing = false;
        box.classList.remove('cr-keybind-box--capturing');
        var savedKey = localStorage.getItem(storageKey);
        display.textContent = savedKey ? getKeyDisplay(savedKey) : defaultValue;
      }
    });
  }

  // Set up PTT keybind
  setupKeybindCapture(kbPttBox, kbPttDisplay, PTT_KEY_STORAGE, 'Space', function (key) {
    if (typeof CAD !== 'undefined' && CAD.Radio && CAD.Radio.setPTTKey) {
      CAD.Radio.setPTTKey(key);
    }
  });

  // Set up Bodycam keybind
  setupKeybindCapture(kbBodycamBox, kbBodycamDisplay, BC_KEY_STORAGE, 'F2', function (key) {
    if (typeof window.__electronBodycam !== 'undefined' && window.__electronBodycam.setKeybind) {
      window.__electronBodycam.setKeybind(key).catch(function () {});
    }
  });

  /* ════════════════════════════════════════════════════════════
     RADIO SETTINGS (beeps only)
  ════════════════════════════════════════════════════════════ */

  var BEEPS_ENABLED = 'cad_radio_beeps';
  var beepsToggle = document.getElementById('cr-beeps-toggle');
  var crSettingsSuccess = document.getElementById('cr-settings-success');

  (function loadRadioBeeps() {
    var beepsVal = localStorage.getItem(BEEPS_ENABLED);
    if (beepsToggle) beepsToggle.checked = beepsVal !== '0';
  })();

  if (beepsToggle) {
    beepsToggle.addEventListener('change', function () {
      localStorage.setItem(BEEPS_ENABLED, this.checked ? '1' : '0');
      if (crSettingsSuccess) {
        crSettingsSuccess.textContent = 'Radio beeps ' + (this.checked ? 'enabled' : 'disabled');
        setTimeout(function () { crSettingsSuccess.textContent = ''; }, 3000);
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     BODYCAM SETTINGS (window target only)
  ════════════════════════════════════════════════════════════ */

  var BC_WINDOW_STORAGE = 'cad_bodycam_window';
  var bcWindowSelect = document.getElementById('bc-window-select');
  var bcSettingsSuccess = document.getElementById('bc-settings-success');

  (function loadBodycamWindow() {
    var savedWindow = localStorage.getItem(BC_WINDOW_STORAGE);
    if (savedWindow && bcWindowSelect) bcWindowSelect.value = savedWindow;
  })();

  if (bcWindowSelect) {
    bcWindowSelect.addEventListener('change', function () {
      localStorage.setItem(BC_WINDOW_STORAGE, this.value);
      if (bcSettingsSuccess) {
        bcSettingsSuccess.textContent = 'Bodycam window target saved.';
        setTimeout(function () { bcSettingsSuccess.textContent = ''; }, 3000);
      }
    });
  }

  /* ── Dashboard navigation ────────────────────────────────── */
  btnDashboard.addEventListener('click', function () { window.location.href = '/dashboard'; });

  /* ── Logout ──────────────────────────────────────────────── */
  document.getElementById('btn-logout').addEventListener('click', function () {
    ['cad_username','cad_user_id','cad_discord_id','cad_servers',
     'cad_active_server','cad_active_server_name','cad_officer_id',
     'cad_officer_dept','cad_join_date','cad_token'].forEach(remove);
    window.location.href = '/';
  });

  /* ── Danger zone ─────────────────────────────────────────── */
  btnLeaveAll.addEventListener('click', function () {
    const leavable = serverData.filter(function (s) {
      return (s.role || '').toLowerCase() !== 'owner';
    });
    if (!leavable.length) {
      alert('You have no servers to leave (you are the owner of all your servers).');
      return;
    }
    startVerification('Leave All Servers?', 'leave_all_servers', function () {
      Promise.all(leavable.map(function (s) {
        return apiFetch('/servers/' + (s.id || s.idserver) + '/leave', { method: 'DELETE' }).catch(function () {});
      })).then(function () { loadServers(); });
    });
  });

  btnDeleteAcct.addEventListener('click', function () {
    startVerification('Delete Your Account?', 'delete_account', function () {
      ['cad_username','cad_user_id','cad_discord_id','cad_servers',
       'cad_active_server','cad_active_server_name','cad_officer_id',
       'cad_officer_dept','cad_join_date'].forEach(remove);
      window.location.href = '/';
    });
  });

  /* ── Verification modal ──────────────────────────────────── */
  function startVerification(title, action, callback) {
    pendingVerifyAction   = action;
    pendingVerifyCallback = callback;
    verifyModalTitle.textContent = title;
    verifyStep1.style.display    = '';
    verifyStep2.style.display    = 'none';
    verifyStep1Error.textContent = '';
    verifyStep2Error.textContent = '';
    inputVerifyCode.value        = '';
    modalVerify.classList.add('open');
  }

  function closeVerifyModal() {
    modalVerify.classList.remove('open');
    pendingVerifyAction   = null;
    pendingVerifyCallback = null;
  }

  btnSendCode.addEventListener('click', function () {
    verifyStep1Error.textContent = '';
    btnSendCode.textContent = 'Sending…';
    btnSendCode.disabled    = true;

    apiFetch('/verification/send', { method: 'POST', body: JSON.stringify({ action: pendingVerifyAction }) })
      .then(function (data) {
        verifyStep2Desc.textContent = 'Enter the 6-digit code sent to ' + data.maskedEmail + ':';
        verifyStep1.style.display   = 'none';
        verifyStep2.style.display   = '';
        inputVerifyCode.focus();
      })
      .catch(function (err) { verifyStep1Error.textContent = err.message; })
      .finally(function () { btnSendCode.textContent = 'Send Code'; btnSendCode.disabled = false; });
  });

  btnSubmitCode.addEventListener('click', function () {
    const code = inputVerifyCode.value.trim();
    verifyStep2Error.textContent = '';
    if (!code || code.length !== 6) { verifyStep2Error.textContent = 'Enter the 6-digit code.'; return; }

    btnSubmitCode.textContent = 'Verifying…';
    btnSubmitCode.disabled    = true;

    apiFetch('/verification/verify', { method: 'POST', body: JSON.stringify({ code, action: pendingVerifyAction }) })
      .then(function () {
        const cb = pendingVerifyCallback;
        closeVerifyModal();
        if (typeof cb === 'function') cb();
      })
      .catch(function (err) { verifyStep2Error.textContent = err.message; })
      .finally(function () { btnSubmitCode.textContent = 'Confirm'; btnSubmitCode.disabled = false; });
  });

  [btnVerifyClose, btnVerifyCancel1, btnVerifyCancel2].forEach(function (btn) {
    if (btn) btn.addEventListener('click', closeVerifyModal);
  });
  modalVerify.addEventListener('click', function (e) { if (e.target === modalVerify) closeVerifyModal(); });

  /* ── Confirm modal ───────────────────────────────────────── */
  function openConfirm(title, desc, onConfirm) {
    confirmTitle.textContent = title;
    confirmDesc.textContent  = desc;
    pendingConfirmAction     = onConfirm;
    modalConfirm.classList.add('open');
  }

  function closeConfirm() { modalConfirm.classList.remove('open'); pendingConfirmAction = null; }

  btnConfirmYes.addEventListener('click',   function () { if (typeof pendingConfirmAction === 'function') pendingConfirmAction(); closeConfirm(); });
  btnConfirmNo.addEventListener('click',    closeConfirm);
  btnConfirmClose.addEventListener('click', closeConfirm);
  modalConfirm.addEventListener('click', function (e) { if (e.target === modalConfirm) closeConfirm(); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeVerifyModal();
    closeConfirm();
  });

})();
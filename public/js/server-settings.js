/**
 * server-settings.js  Ultimate CAD Server Settings Page
 * Now includes ERLC server key management.
 */

(function () {
  'use strict';

  const API_BASE = '';

  function get(key)      { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function set(key, val) { try { localStorage.setItem(key, val);   } catch (_) {} }
  function remove(key)   { try { localStorage.removeItem(key);     } catch (_) {} }

  const serverId   = get('cad_active_server');
  const serverName = get('cad_active_server_name') || 'Unknown Server';
  const userId     = get('cad_user_id');
  const username   = get('cad_username') || 'Admin';

  if (!userId)   { window.location.href = 'index.html';     return; }
  if (!serverId) { window.location.href = 'dashboard.html'; return; }

  function apiFetch(url, opts) {
    return fetch(API_BASE + url, Object.assign({
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    }, opts || {}))
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'API error'); });
        return r.json();
      });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function generateCode(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: len || 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  /* ── Element refs ──────────────────────────────────────── */
  const navTitle      = document.getElementById('ss-nav-title');
  const btnBack       = document.getElementById('btn-back');
  const btnDashboard  = document.getElementById('btn-dashboard');
  const membersBody   = document.getElementById('ss-members-body');
  const memberCount   = document.getElementById('ss-member-count');

  const inputName     = document.getElementById('input-server-name');
  const inputCode     = document.getElementById('input-join-code');
  const inputDesc     = document.getElementById('input-server-desc');
  const inputDiscord  = document.getElementById('input-discord-id');
  const inputErlcKey  = document.getElementById('input-erlc-key');
  const btnTestErlc   = document.getElementById('btn-test-erlc');
  const erlcStatus    = document.getElementById('erlc-status');
  const errorMsg      = document.getElementById('ss-error');
  const successMsg    = document.getElementById('ss-success');

  const btnCopyCode   = document.getElementById('btn-copy-code');
  const btnRegenCode  = document.getElementById('btn-regen-code');
  const btnSave       = document.getElementById('btn-save-settings');
  const btnDeleteSrv  = document.getElementById('btn-delete-server');

  const modalKick      = document.getElementById('modal-kick');
  const kickTitle      = document.getElementById('kick-title');
  const kickDesc       = document.getElementById('kick-desc');
  const btnKickClose   = document.getElementById('btn-kick-close');
  const btnKickConfirm = document.getElementById('btn-kick-confirm');
  const btnKickCancel  = document.getElementById('btn-kick-cancel');

  const modalRole      = document.getElementById('modal-role');
  const roleGrid       = document.getElementById('role-grid');
  const btnRoleClose   = document.getElementById('btn-role-close');
  const btnRoleConfirm = document.getElementById('btn-role-confirm');
  const btnRoleCancel  = document.getElementById('btn-role-cancel');

  const modalDelete        = document.getElementById('modal-delete');
  const deleteStep1        = document.getElementById('delete-step-1');
  const deleteStep2        = document.getElementById('delete-step-2');
  const deleteSendError    = document.getElementById('delete-send-error');
  const deleteError        = document.getElementById('delete-error');
  const deleteCodeDesc     = document.getElementById('delete-code-desc');
  const btnDeleteSendCode  = document.getElementById('btn-delete-send-code');
  const inputDeleteCode    = document.getElementById('input-delete-code');
  const inputConfirmName   = document.getElementById('input-confirm-name');
  const btnDeleteConf      = document.getElementById('btn-delete-confirm');
  const btnDeleteClose     = document.getElementById('btn-delete-close');
  const btnDeleteCancel    = document.getElementById('btn-delete-cancel');
  const btnDeleteCancel2   = document.getElementById('btn-delete-cancel-2');

  const deptList      = document.getElementById('ss-dept-list');
  const deptAddRow    = document.getElementById('dept-add-row');
  const inputDeptName = document.getElementById('input-dept-name');
  const inputDeptType = document.getElementById('input-dept-type');
  const btnAddDept    = document.getElementById('btn-add-dept');

  let members           = [];
  let currentServerName = serverName;
  let isOwner           = false;
  let pendingKickMember = null;
  let departments       = [];

  /* ── Navbar ────────────────────────────────────────────── */
  navTitle.textContent = 'Server Settings — ' + serverName;

  btnBack.addEventListener('click',      function () { window.location.href = 'server-page.html'; });
  btnDashboard.addEventListener('click', function () { window.location.href = 'dashboard.html'; });

  /* ── Modal helpers ─────────────────────────────────────── */
  function openModal(el)  { el.classList.add('open'); }
  function closeModal(el) { el.classList.remove('open'); }

  [modalKick, modalRole, modalDelete].forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(m); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') [modalKick, modalRole, modalDelete].forEach(closeModal);
  });

  function clearMessages() { errorMsg.textContent = ''; successMsg.textContent = ''; }

  function showError(msg) {
    errorMsg.textContent   = msg;
    successMsg.textContent = '';
  }

  function showSuccess(msg) {
    successMsg.textContent = msg;
    errorMsg.textContent   = '';
    setTimeout(function () { successMsg.textContent = ''; }, 3000);
  }

  /* ── Load server info ──────────────────────────────────── */
  function loadServerInfo() {
    inputName.value = serverName;
    inputCode.value = get('cad_server_join_code') || '';

    apiFetch('/servers/name/' + serverId)
      .then(function (srv) {
        if (!srv) return;
        currentServerName     = srv.name || serverName;
        inputName.value       = srv.name || serverName;
        inputDesc.value       = srv.description || '';
        inputDiscord.value    = srv.discord_id || '';
        navTitle.textContent  = 'Server Settings — ' + currentServerName;
        isOwner = String(srv.owner_id) === String(userId);

        // Server no longer sends the key value (encrypted or not) — just a flag.
        if (srv.hasErlcKey && inputErlcKey) {
          inputErlcKey.placeholder = '•••••••• (key on file)';
          inputErlcKey.dataset.hasKey = 'true';
        }
      })
      .catch(function () {});

    apiFetch('/servers/join-code/' + serverId)
      .then(function (data) {
        if (data && data.code) {
          inputCode.value = data.code;
          set('cad_server_join_code', data.code);
        }
      })
      .catch(function () {});
  }

  loadServerInfo();

  /* ── ERLC key test ─────────────────────────────────────── */
  if (btnTestErlc && inputErlcKey && erlcStatus) {
    btnTestErlc.addEventListener('click', function () {
      const key = inputErlcKey.value.trim();
      if (!key) {
        erlcStatus.textContent = 'Enter a key to test.';
        erlcStatus.style.color = '#ffbb00';
        return;
      }

      btnTestErlc.textContent = 'Testing…';
      btnTestErlc.disabled    = true;
      erlcStatus.textContent  = '';

      apiFetch('/erlc/' + serverId + '/validate-key', {
        method: 'POST',
        body: JSON.stringify({ key }),
      })
        .then(function (result) {
          if (result.valid) {
            erlcStatus.textContent = '✓ Key is valid and connected.';
            erlcStatus.style.color = '#00ff2f';
          } else {
            erlcStatus.textContent = '✗ ' + (result.reason || 'Invalid key.');
            erlcStatus.style.color = '#ff0004';
          }
        })
        .catch(function (err) {
          erlcStatus.textContent = '✗ ' + err.message;
          erlcStatus.style.color = '#ff0004';
        })
        .finally(function () {
          btnTestErlc.textContent = 'Test';
          btnTestErlc.disabled    = false;
        });
    });
  }

  /* ── Load members ──────────────────────────────────────── */
  function loadMembers() {
    membersBody.innerHTML = '<div class="ss-members-empty" style="color:rgba(255,255,255,0.3);">Loading members…</div>';

    apiFetch('/servers/' + serverId + '/members')
      .then(function (rows) {
        members = rows || [];
        renderMembers();
      })
      .catch(function () {
        membersBody.innerHTML = '<div class="ss-members-empty">Could not load members.</div>';
        memberCount.textContent = '–';
      });
  }

  loadMembers();
  loadDepartments();

  function renderMembers() {
    membersBody.innerHTML = '';
    memberCount.textContent = members.length + ' member' + (members.length !== 1 ? 's' : '');

    if (!members.length) {
      const empty = document.createElement('div');
      empty.className   = 'ss-members-empty';
      empty.textContent = 'No members found.';
      membersBody.appendChild(empty);
      return;
    }

    members.forEach(function (m, idx) {
      const row = document.createElement('div');
      row.className = 'ss-member-row';
      row.style.animationDelay = (idx * 35) + 'ms';

      const roleLower     = (m.role || 'member').toLowerCase();
      const badgeClass    = 'ss-role-badge--' + roleLower;
      const isMemberOwner = roleLower === 'owner';
      const isSelf        = String(m.iduser) === String(userId);

      const robloxBadge = m.roblox_username
        ? '<span style="font-size:0.7rem;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);border-radius:0.375rem;padding:0.125rem 0.5rem;margin-left:0.375rem;">🎮 ' + esc(m.roblox_username) + '</span>'
        : '';

      const actionHtml = (isOwner && !isMemberOwner && !isSelf)
        ? '<button class="ss-row-btn ss-row-btn--kick" data-id="' + esc(String(m.iduser)) + '" data-name="' + esc(m.username) + '">Kick</button>'
        : (isSelf ? '<span style="font-size:0.75rem;color:rgba(255,255,255,0.3);">You</span>' : '');

      row.innerHTML =
        '<span class="ss-member-cell ss-member-cell--name">' + esc(m.username) + robloxBadge + '</span>' +
        '<span class="ss-member-cell ss-member-cell--role">' +
          '<span class="ss-role-badge ' + badgeClass + '">' + esc(m.role || 'Member') + '</span>' +
        '</span>' +
        '<span class="ss-member-cell ss-member-cell--joined">' + formatDate(m.joined_at) + '</span>' +
        '<span class="ss-member-cell ss-member-cell--action">' + actionHtml + '</span>';

      membersBody.appendChild(row);
    });
  }

  /* ── Department management ─────────────────────────────────── */
  function loadDepartments() {
    apiFetch('/departments/' + serverId)
      .then(function (rows) {
        departments = rows || [];
        renderDepartments();
      })
      .catch(function () {
        deptList.innerHTML = '<div class="ss-dept-empty">Could not load departments.</div>';
      });
  }

  function renderDepartments() {
    deptList.innerHTML = '';

    if (!departments.length) {
      deptList.innerHTML = '<div class="ss-dept-empty">No custom departments yet — default names are used.</div>';
    } else {
      departments.forEach(function (d) {
        var row = document.createElement('div');
        row.className = 'ss-dept-row';

        var badgeClass = 'ss-dept-badge--' + d.type.toLowerCase();
        var removeBtn = isOwner
          ? '<button class="ss-dept-remove" data-id="' + esc(String(d.id)) + '">Remove</button>'
          : '';

        row.innerHTML =
          '<span class="ss-dept-badge ' + badgeClass + '">' + esc(d.type) + '</span>' +
          '<span class="ss-dept-name">' + esc(d.name) + '</span>' +
          removeBtn;

        deptList.appendChild(row);
      });
    }

    if (deptAddRow) deptAddRow.style.display = isOwner ? '' : 'none';
  }

  if (btnAddDept) {
    btnAddDept.addEventListener('click', function () {
      var name = inputDeptName.value.trim();
      var type = inputDeptType.value;
      if (!name) { showError('Department name is required.'); return; }

      btnAddDept.disabled    = true;
      btnAddDept.textContent = 'Adding…';

      apiFetch('/departments', {
        method: 'POST',
        body: JSON.stringify({ serverId: Number(serverId), name: name, type: type }),
      })
        .then(function (dept) {
          departments.push(dept);
          renderDepartments();
          inputDeptName.value = '';
          showSuccess('Department added.');
        })
        .catch(function (err) {
          showError('Could not add department: ' + err.message);
        })
        .finally(function () {
          btnAddDept.disabled    = false;
          btnAddDept.textContent = 'Add';
        });
    });
  }

  if (deptList) {
    deptList.addEventListener('click', function (e) {
      var btn = e.target.closest('.ss-dept-remove');
      if (!btn) return;
      var id = btn.getAttribute('data-id');

      apiFetch('/departments/' + id, { method: 'DELETE' })
        .then(function () {
          departments = departments.filter(function (d) { return String(d.id) !== String(id); });
          renderDepartments();
          showSuccess('Department removed.');
        })
        .catch(function (err) { showError('Could not remove department: ' + err.message); });
    });
  }

  /* ── Kick delegation ───────────────────────────────────── */
  membersBody.addEventListener('click', function (e) {
    const kickBtn = e.target.closest('.ss-row-btn--kick');
    if (!kickBtn) return;
    pendingKickMember = {
      iduser:   kickBtn.getAttribute('data-id'),
      username: kickBtn.getAttribute('data-name'),
    };
    kickTitle.textContent = 'Kick ' + pendingKickMember.username + '?';
    kickDesc.textContent  = pendingKickMember.username + ' will be removed from the server.';
    openModal(modalKick);
  });

  btnKickConfirm.addEventListener('click', function () {
    if (!pendingKickMember) return;
    const memberId = pendingKickMember.iduser;
    const name     = pendingKickMember.username;

    btnKickConfirm.textContent = 'Kicking…';
    btnKickConfirm.disabled    = true;

    apiFetch('/servers/' + serverId + '/members/' + memberId, { method: 'DELETE' })
      .then(function () {
        members = members.filter(function (m) { return String(m.iduser) !== String(memberId); });
        renderMembers();
        closeModal(modalKick);
        showSuccess(name + ' has been removed from the server.');
      })
      .catch(function (err) {
        closeModal(modalKick);
        showError('Could not kick member: ' + err.message);
      })
      .finally(function () {
        btnKickConfirm.textContent = 'Kick';
        btnKickConfirm.disabled    = false;
        pendingKickMember = null;
      });
  });

  btnKickCancel.addEventListener('click', function () { pendingKickMember = null; closeModal(modalKick); });
  btnKickClose.addEventListener('click',  function () { pendingKickMember = null; closeModal(modalKick); });

  /* ── Role modal ────────────────────────────────────────── */
  let pendingRoleVal = null;
  roleGrid.addEventListener('click', function (e) {
    const btn = e.target.closest('.ss-role-btn');
    if (!btn) return;
    roleGrid.querySelectorAll('.ss-role-btn').forEach(function (b) { b.classList.remove('selected'); });
    btn.classList.add('selected');
    pendingRoleVal = btn.getAttribute('data-role');
  });
  btnRoleConfirm.addEventListener('click', function () { closeModal(modalRole); showSuccess('Role updated.'); pendingRoleVal = null; });
  btnRoleCancel.addEventListener('click', function () { closeModal(modalRole); pendingRoleVal = null; });
  btnRoleClose.addEventListener('click',  function () { closeModal(modalRole); pendingRoleVal = null; });

  /* ── Join code ─────────────────────────────────────────── */
  btnCopyCode.addEventListener('click', function () {
    const code = inputCode.value.trim();
    if (!code) return;
    navigator.clipboard.writeText(code).then(function () {
      const orig = btnCopyCode.textContent;
      btnCopyCode.textContent = 'Copied!';
      setTimeout(function () { btnCopyCode.textContent = orig; }, 1500);
    }).catch(function () { inputCode.select(); });
  });

  btnRegenCode.addEventListener('click', function () {
    inputCode.value = generateCode(8);
    clearMessages();
  });

  inputCode.addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  /* ── Save settings (includes ERLC key) ────────────────── */
  btnSave.addEventListener('click', function () {
    clearMessages();

    const name    = inputName.value.trim();
    const code    = inputCode.value.trim();
    const desc    = inputDesc.value.trim();
    const discord = inputDiscord.value.trim() || null;
    const erlcKey = inputErlcKey ? inputErlcKey.value.trim() || null : null;

    if (!name) { showError('Server name is required.'); return; }
    if (!code) { showError('Join code is required.'); return; }

    btnSave.classList.add('ss-loading');
    btnSave.textContent = 'Saving…';

    const payload = {
      name,
      description: desc || null,
      joinCode:    code,
      discordId:   discord,
    };

    // Only include erlcServerKey in payload if user typed something new
    if (erlcKey) payload.erlcServerKey = erlcKey;

    apiFetch('/servers/' + serverId + '/update', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
      .then(function (srv) {
        currentServerName = srv.name || name;
        navTitle.textContent = 'Server Settings — ' + currentServerName;
        set('cad_active_server_name', currentServerName);
        set('cad_server_join_code', srv.join_code || code);
        if (srv.join_code) inputCode.value = srv.join_code;

        // Clear ERLC key field and update placeholder after save
        if (inputErlcKey && erlcKey) {
          inputErlcKey.value = '';
          inputErlcKey.placeholder = '••••••••' + erlcKey.slice(-8);
          inputErlcKey.dataset.hasKey = 'true';
          if (erlcStatus) { erlcStatus.textContent = ''; }
        }

        showSuccess('Settings saved.');
      })
      .catch(function (err) {
        showError('Save failed: ' + err.message);
      })
      .finally(function () {
        btnSave.classList.remove('ss-loading');
        btnSave.textContent = 'Save Settings';
      });
  });

  /* ── Delete server ─────────────────────────────────────── */
  btnDeleteSrv.addEventListener('click', function () {
    deleteStep1.style.display   = '';
    deleteStep2.style.display   = 'none';
    deleteSendError.textContent = '';
    deleteError.textContent     = '';
    inputConfirmName.value      = '';
    if (inputDeleteCode) inputDeleteCode.value = '';
    openModal(modalDelete);
  });

  btnDeleteSendCode.addEventListener('click', function () {
    deleteSendError.textContent   = '';
    btnDeleteSendCode.textContent = 'Sending…';
    btnDeleteSendCode.disabled    = true;

    apiFetch('/verification/send', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete_server_' + serverId }),
    })
      .then(function (data) {
        if (deleteCodeDesc)
          deleteCodeDesc.textContent = 'Enter the 6-digit code sent to ' + data.maskedEmail + ', then type the server name to confirm.';
        deleteStep1.style.display = 'none';
        deleteStep2.style.display = '';
        if (inputDeleteCode) inputDeleteCode.focus();
      })
      .catch(function (err) {
        deleteSendError.textContent = err.message;
      })
      .finally(function () {
        btnDeleteSendCode.textContent = 'Send Code';
        btnDeleteSendCode.disabled    = false;
      });
  });

  btnDeleteConf.addEventListener('click', function () {
    deleteError.textContent = '';

    const code  = inputDeleteCode ? inputDeleteCode.value.trim() : '';
    const typed = inputConfirmName.value.trim();

    if (!code || code.length !== 6) { deleteError.textContent = 'Enter the 6-digit verification code.'; return; }
    if (typed.toLowerCase() !== currentServerName.toLowerCase()) {
      deleteError.textContent = 'Server name does not match. Please try again.';
      return;
    }

    btnDeleteConf.textContent = 'Verifying…';
    btnDeleteConf.disabled    = true;

    apiFetch('/verification/verify', {
      method: 'POST',
      body: JSON.stringify({ code, action: 'delete_server_' + serverId }),
    })
      .then(function () {
        return apiFetch('/servers/' + serverId, { method: 'DELETE' });
      })
      .then(function () {
        remove('cad_active_server');
        remove('cad_active_server_name');
        remove('cad_server_join_code');
        window.location.href = 'dashboard.html';
      })
      .catch(function (err) {
        deleteError.textContent   = err.message;
        btnDeleteConf.textContent = 'Delete Forever';
        btnDeleteConf.disabled    = false;
      });
  });

  function closeDeleteModal() { closeModal(modalDelete); }
  btnDeleteClose.addEventListener('click',  closeDeleteModal);
  btnDeleteCancel.addEventListener('click', closeDeleteModal);
  if (btnDeleteCancel2) btnDeleteCancel2.addEventListener('click', closeDeleteModal);

})();
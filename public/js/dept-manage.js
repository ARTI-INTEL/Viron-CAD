/**
 * dept-manage.js  Ultimate CAD Department Management
 *
 * Tabs: Employees, Ranks, Additional Roles, Documents
 * Requires: deptId in URL (?deptId=X), HR_ACCESS permission.
 */

(function () {
  'use strict';

  const API_BASE = '';

  function get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function set(key, val) { try { localStorage.setItem(key, val); } catch (_) {} }

  const userId   = get('cad_user_id');
  const serverId = get('cad_active_server');

  if (!userId || !serverId) { window.location.href = 'server-page.html'; return; }

  // Parse deptId from URL
  const urlParams = new URLSearchParams(window.location.search);
  const deptId    = urlParams.get('deptId');
  if (!deptId) { window.location.href = 'server-page.html'; return; }

  let isOwner      = false;
  let deptData     = null;
  let ranks        = [];
  let roles        = [];
  let editingMemberId = null;
  let infractingMemberId = null;
  let infractingMemberName = '';
  let minWeeklyActivity = 0;
  let weeklyActivityMap = {};  // {user_id: count}

  /* ── API helpers ──────────────────────────────────────────── */
  function apiFetch(url, opts) {
    return fetch(API_BASE + url, Object.assign({
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    }, opts || {}))
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'API error'); });
        return r.json();
      });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Element refs ─────────────────────────────────────────── */
  const $ = function (id) { return document.getElementById(id); };

  const navTitle       = $('dm-nav-title');
  const errorMsg       = $('dm-error');
  const successMsg     = $('dm-success');

  const tabs           = document.querySelectorAll('.dm-tab');
  const tabPanels      = document.querySelectorAll('.dm-tab-panel');

  const membersList    = $('dm-members-list');
  const ranksList      = $('dm-ranks-list');
  const rolesList      = $('dm-roles-list');
  const docsList       = $('dm-docs-list');

  // Members modals
  const modalAddMember     = $('modal-add-member');
  const modalEditMember    = $('modal-edit-member');
  const inputAddUserId     = $('input-add-user-id');
  const inputAddRankId     = $('input-add-rank-id');
  const inputEditRankId    = $('input-edit-rank-id');
  const rolesChecklist     = $('dm-roles-checklist');
  const editMemberTitle    = $('edit-member-title');

  // Ranks modals
  const modalAddRank       = $('modal-add-rank');
  const inputRankName      = $('input-rank-name');
  const rankPermCheckboxes = document.querySelectorAll('#dm-rank-perms input[type="checkbox"]');

  // Roles modals
  const modalAddRole       = $('modal-add-role');
  const inputRoleName      = $('input-role-name');

  // Vehicles
  const vehiclesList       = $('dm-vehicles-list');
  const modalAddVehicle    = $('modal-add-vehicle');
  const modalEditVehicle   = $('modal-edit-vehicle');
  const inputVehName       = $('input-veh-name');
  const inputVehModel      = $('input-veh-model');
  const inputVehPlate      = $('input-veh-plate');
  const inputVehColor      = $('input-veh-color');
  const inputEditVehName   = $('input-edit-veh-name');
  const inputEditVehModel  = $('input-edit-veh-model');
  const inputEditVehPlate  = $('input-edit-veh-plate');
  const inputEditVehColor  = $('input-edit-veh-color');
  const chkAssignedVehicles = $('chk-assigned-vehicles');
  let editingVehicleId     = null;

  // Docs modals
  const modalAddDoc        = $('modal-add-doc');
  const inputDocTitle      = $('input-doc-title');
  const inputDocUrl        = $('input-doc-url');

  // Activity elements
  const inputMinActivity  = $('input-min-activity');
  const btnSetMinActivity = $('btn-set-min-activity');

  // Infraction modals
  const modalGiveInfraction = $('modal-give-infraction');
  const inputInfractionReason = $('input-infraction-reason');
  const infractionModalTitle = $('infraction-modal-title');

  /* ── Messaging ────────────────────────────────────────────── */
  function showError(msg) { errorMsg.textContent = msg; successMsg.textContent = ''; }
  function showSuccess(msg) {
    successMsg.textContent = msg; errorMsg.textContent = '';
    setTimeout(function () { successMsg.textContent = ''; }, 3000);
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    apiFetch('/servers/name/' + serverId)
      .then(function (srv) {
        if (srv) isOwner = String(srv.owner_id) === String(userId);
      })
      .catch(function () {});

    // Load dept info
    apiFetch('/departments/' + serverId)
      .then(function (depts) {
        deptData = depts.find(function (d) { return String(d.id) === deptId; });
        if (deptData) {
          navTitle.textContent = 'Manage — ' + esc(deptData.name);
        }
        // Now that deptData is loaded, set the toggle state
        loadDeptSettings();
      })
      .catch(function () {});

    loadAll();
  }

  function loadAll() {
    loadMembers();
    loadRanks();
    loadRoles();
    loadDocs();
    loadVehicles();
  }

  /* ── Tab switching ────────────────────────────────────────── */
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tabPanels.forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      var panel = $('tab-' + tab.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });

  /* ── Navigation ───────────────────────────────────────────── */
  $('btn-back').addEventListener('click', function () { window.location.href = 'server-page.html'; });
  $('btn-dashboard').addEventListener('click', function () { window.location.href = 'dashboard.html'; });

  /* ── Modal helpers ────────────────────────────────────────── */
  function openModal(el)  { el.classList.add('open'); }
  function closeModal(el) { el.classList.remove('open'); }

  document.querySelectorAll('.modal-overlay').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(m); });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     EMPLOYEES TAB
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  function loadMembers() {
    // Fetch both members list and weekly activity stats
    Promise.all([
      apiFetch('/dept-members/' + deptId).catch(function () { return []; }),
      apiFetch('/dept-activity/' + deptId + '/weekly').catch(function () { return []; }),
      apiFetch('/dept-activity/' + deptId + '/min-activity').catch(function () { return { min_weekly_activity: 0 }; }),
    ]).then(function (results) {
      var members = results[0] || [];
      var activityRows = results[1] || [];
      var minData = results[2] || {};

      minWeeklyActivity = minData.min_weekly_activity || 0;
      inputMinActivity.value = minWeeklyActivity;

      // Build activity map: user_id -> count
      weeklyActivityMap = {};
      activityRows.forEach(function (a) { weeklyActivityMap[a.user_id] = a.activity_count; });

      renderMembers(members);
    }).catch(function () {
      membersList.innerHTML = '<div class="dm-empty">Could not load members.</div>';
    });
  }

  function renderMembers(members) {
    membersList.innerHTML = '';
    if (!members.length) {
      membersList.innerHTML = '<div class="dm-empty">No members assigned to this department.</div>';
      return;
    }

    var memberIds = members.map(function (m) { return m.id; });

    // Fetch roles + infractions for each member in parallel
    var dataPromises = memberIds.map(function (mid) {
      var rolesPromise = apiFetch('/dept-members/' + mid + '/roles').catch(function () { return []; });
      var infPromise = apiFetch('/dept-infractions/' + deptId + '/member/' + mid)
        .then(function (infractions) { return (infractions || []).length; })
        .catch(function () { return 0; });
      return Promise.all([rolesPromise, infPromise]);
    });

    Promise.all(dataPromises).then(function (allData) {
      // Determine the next rank ID for cycling through promotions
      var sortedRanks = ranks.slice().sort(function (a, b) { return a.id - b.id; });

      members.forEach(function (m, idx) {
        var row = document.createElement('div');
        row.className = 'dm-row';

        var data = allData[idx];
        var memberRoles = data ? data[0] : [];
        var infractionCount = data ? data[1] : 0;

        var rolesHtml = memberRoles.length
          ? memberRoles.map(function (r) { return '<span class="dm-role-chip">' + esc(r.role_name) + '</span>'; }).join('')
          : '<span class="dm-cell--muted">–</span>';

        var infBadgeClass = infractionCount > 0 ? 'dm-infraction-badge' : 'dm-infraction-badge dm-infraction-badge--none';
        var infBadge = '<span class="' + infBadgeClass + '" data-member-id="' + m.id + '">' +
          (infractionCount > 0 ? esc(String(infractionCount)) : '0') + '</span>';

        // Activity badge
        var userActivity = weeklyActivityMap[m.user_id] || 0;
        var actBadgeClass = 'dm-activity-badge';
        if (minWeeklyActivity > 0) {
          if (userActivity >= minWeeklyActivity) actBadgeClass += ' dm-activity-badge--good';
          else if (userActivity > 0) actBadgeClass += ' dm-activity-badge--warn';
          else actBadgeClass += ' dm-activity-badge--bad';
        } else {
          actBadgeClass += ' dm-activity-badge--good';
        }
        var activityBadge = '<span class="' + actBadgeClass + '" title="Weekly activity: ' + userActivity + (minWeeklyActivity > 0 ? ' / Min: ' + minWeeklyActivity : '') + '">' +
          esc(String(userActivity)) + '</span>';

        // Promote button: cycle to next rank
        var currentRankIdx = -1;
        for (var ri = 0; ri < sortedRanks.length; ri++) {
          if (String(sortedRanks[ri].id) === String(m.rank_id)) { currentRankIdx = ri; break; }
        }
        var nextRankId = '';
        var promoteLabel = 'Promote';
        if (currentRankIdx >= 0 && currentRankIdx < sortedRanks.length - 1) {
          nextRankId = sortedRanks[currentRankIdx + 1].id;
        } else if (currentRankIdx < 0 && sortedRanks.length > 0) {
          nextRankId = sortedRanks[0].id;
          promoteLabel = 'Assign Rank';
        }
        var promoteBtn = nextRankId
          ? '<button class="dm-row-btn dm-row-btn--promote" data-id="' + m.id + '" data-rank-id="' + nextRankId + '">' + promoteLabel + '</button>'
          : '';

        var infractBtn = '<button class="dm-row-btn dm-row-btn--infract" data-id="' + m.id + '" data-username="' + esc(m.username) + '">Infract</button>';
        var editBtn = '<button class="dm-row-btn dm-row-btn--edit" data-id="' + esc(String(m.id)) + '">Edit</button>';

        row.innerHTML =
          '<span class="dm-cell" style="flex:1">' + esc(m.username) + '</span>' +
          '<span class="dm-cell" style="width:10rem">' + esc(m.rank_name || '—') + '</span>' +
          '<span class="dm-cell" style="width:14rem">' + rolesHtml + '</span>' +
          '<span class="dm-cell" style="width:4rem">' + infBadge + '</span>' +
          '<span class="dm-cell" style="width:6rem">' + activityBadge + '</span>' +
          '<span class="dm-cell" style="width:8rem">' + promoteBtn + infractBtn + editBtn + '</span>';

        membersList.appendChild(row);
      });

      // Wire edit buttons (infract and promote use delegated listeners)
      membersList.querySelectorAll('.dm-row-btn--edit').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-id');
          var member = members.find(function (m) { return String(m.id) === id; });
          if (member) openEditMember(member);
        });
      });
    });
  }

  // ── Add Member ──────────────────────────────────────────────

  $('btn-add-member').addEventListener('click', function () {
    populateRankSelect(inputAddRankId);
    inputAddUserId.value = '';
    openModal(modalAddMember);
  });

  $('btn-close-add-member').addEventListener('click', function () { closeModal(modalAddMember); });
  $('btn-cancel-add-member').addEventListener('click', function () { closeModal(modalAddMember); });

  $('btn-confirm-add-member').addEventListener('click', function () {
    var uid = inputAddUserId.value.trim();
    var rid = inputAddRankId.value;
    if (!uid) { showError('User ID is required.'); return; }

    apiFetch('/dept-members', {
      method: 'POST',
      body: JSON.stringify({ deptId: Number(deptId), userId: Number(uid), rankId: rid ? Number(rid) : null }),
    })
      .then(function () {
        closeModal(modalAddMember);
        loadMembers();
        showSuccess('Member added.');
      })
      .catch(function (err) { showError(err.message); });
  });

  // ── Edit Member ─────────────────────────────────────────────

  function openEditMember(member) {
    editingMemberId = member.id;
    editMemberTitle.textContent = 'Edit — ' + esc(member.username);
    populateRankSelect(inputEditRankId, member.rank_id);
    populateRolesChecklist(member.id);
    openModal(modalEditMember);
  }

  $('btn-close-edit-member').addEventListener('click', function () { closeModal(modalEditMember); });
  $('btn-cancel-edit-member').addEventListener('click', function () { closeModal(modalEditMember); });

  $('btn-confirm-edit-member').addEventListener('click', function () {
    var rid = inputEditRankId.value;

    apiFetch('/dept-members/' + editingMemberId, {
      method: 'PATCH',
      body: JSON.stringify({ rankId: rid ? Number(rid) : null }),
    })
      .then(function () {
        // Update role assignments
        var checkedRoles = rolesChecklist.querySelectorAll('input[type="checkbox"]:checked');
        var rolePromises = [];
        // First get current roles
        return apiFetch('/dept-members/' + editingMemberId + '/roles').then(function (currentRoles) {
          var currentIds = currentRoles.map(function (r) { return r.link_id; });
          var desiredIds = Array.from(checkedRoles).map(function (cb) { return Number(cb.value); });

          // Remove unchecked
          currentRoles.forEach(function (cr) {
            if (!desiredIds.includes(cr.role_id)) {
              rolePromises.push(
                apiFetch('/dept-members/' + editingMemberId + '/roles/' + cr.link_id, { method: 'DELETE' }).catch(function () {})
              );
            }
          });

          // Add newly checked
          var currentRoleIds = currentRoles.map(function (r) { return r.role_id; });
          desiredIds.forEach(function (rid) {
            if (!currentRoleIds.includes(rid)) {
              rolePromises.push(
                apiFetch('/dept-members/' + editingMemberId + '/roles', {
                  method: 'POST',
                  body: JSON.stringify({ roleId: rid }),
                }).catch(function () {})
              );
            }
          });

          return Promise.all(rolePromises);
        });
      })
      .then(function () {
        closeModal(modalEditMember);
        loadMembers();
        showSuccess('Member updated.');
      })
      .catch(function (err) { showError(err.message); });
  });

  function populateRankSelect(selectEl, selectedId) {
    selectEl.innerHTML = '<option value="">No rank</option>';
    ranks.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      if (String(r.id) === String(selectedId)) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function populateRolesChecklist(memberId) {
    rolesChecklist.innerHTML = '';
    if (!roles.length) {
      rolesChecklist.innerHTML = '<span class="dm-cell--muted">No additional roles defined yet.</span>';
      return;
    }

    apiFetch('/dept-members/' + memberId + '/roles')
      .then(function (assigned) {
        var assignedIds = assigned.map(function (r) { return r.role_id; });
        roles.forEach(function (r) {
          var label = document.createElement('label');
          label.className = 'dm-role-check-item';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = r.id;
          if (assignedIds.includes(r.id)) cb.checked = true;
          label.appendChild(cb);
          label.appendChild(document.createTextNode(' ' + r.name));
          rolesChecklist.appendChild(label);
        });
      })
      .catch(function () {});
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     RANKS TAB
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  function loadRanks() {
    apiFetch('/dept-ranks/' + deptId)
      .then(function (rows) { ranks = rows || []; renderRanks(); })
      .catch(function () { ranksList.innerHTML = '<div class="dm-empty">Could not load ranks.</div>'; });
  }

  function renderRanks() {
    ranksList.innerHTML = '';
    if (!ranks.length) {
      ranksList.innerHTML = '<div class="dm-empty">No ranks defined. Add one to start assigning permissions.</div>';
      return;
    }

    ranks.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'dm-row';

      var perms = r.permissions || [];
      var permHtml = perms.length
        ? perms.map(function (p) {
            var cls = p === 'HR_ACCESS' ? 'hr' : p === 'SUPERVISOR' ? 'sup' : 'roles';
            return '<span class="dm-perm-badge dm-perm-badge--' + cls + '">' + esc(p) + '</span>';
          }).join('')
        : '<span class="dm-cell--muted">None</span>';

      row.innerHTML =
        '<span class="dm-cell" style="flex:1">' + esc(r.name) + '</span>' +
        '<span class="dm-cell" style="width:22rem">' + permHtml + '</span>' +
        '<span class="dm-cell" style="width:6rem">' +
          '<button class="dm-row-btn dm-row-btn--del" data-id="' + r.id + '">Delete</button>' +
        '</span>';

      ranksList.appendChild(row);
    });

    // Wire delete
    ranksList.querySelectorAll('.dm-row-btn--del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (!confirm('Delete this rank? Members with this rank will have no rank assigned.')) return;
        apiFetch('/dept-ranks/' + id, { method: 'DELETE' })
          .then(function () { loadRanks(); loadMembers(); showSuccess('Rank deleted.'); })
          .catch(function (err) { showError(err.message); });
      });
    });
  }

  // ── Add Rank ────────────────────────────────────────────────

  $('btn-add-rank').addEventListener('click', function () {
    inputRankName.value = '';
    rankPermCheckboxes.forEach(function (cb) { cb.checked = false; });
    openModal(modalAddRank);
  });

  $('btn-close-add-rank').addEventListener('click', function () { closeModal(modalAddRank); });
  $('btn-cancel-add-rank').addEventListener('click', function () { closeModal(modalAddRank); });

  $('btn-confirm-add-rank').addEventListener('click', function () {
    var name = inputRankName.value.trim();
    if (!name) { showError('Rank name is required.'); return; }

    var perms = [];
    rankPermCheckboxes.forEach(function (cb) { if (cb.checked) perms.push(cb.value); });

    apiFetch('/dept-ranks', {
      method: 'POST',
      body: JSON.stringify({ deptId: Number(deptId), name: name, permissions: perms }),
    })
      .then(function () {
        closeModal(modalAddRank);
        loadRanks();
        showSuccess('Rank created.');
      })
      .catch(function (err) { showError(err.message); });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     ADDITIONAL ROLES TAB
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  function loadRoles() {
    apiFetch('/dept-ranks/' + deptId + '/roles')
      .then(function (rows) { roles = rows || []; renderRoles(); })
      .catch(function () { rolesList.innerHTML = '<div class="dm-empty">Could not load roles.</div>'; });
  }

  function renderRoles() {
    rolesList.innerHTML = '';
    if (!roles.length) {
      rolesList.innerHTML = '<div class="dm-empty">No additional roles defined.</div>';
      return;
    }

    roles.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'dm-row';
      row.innerHTML =
        '<span class="dm-cell" style="flex:1">' + esc(r.name) + '</span>' +
        '<span class="dm-cell" style="width:6rem">' +
          '<button class="dm-row-btn dm-row-btn--del" data-id="' + r.id + '">Delete</button>' +
        '</span>';
      rolesList.appendChild(row);
    });

    rolesList.querySelectorAll('.dm-row-btn--del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (!confirm('Delete this role? It will be removed from all members.')) return;
        apiFetch('/dept-ranks/roles/' + id, { method: 'DELETE' })
          .then(function () { loadRoles(); showSuccess('Role deleted.'); })
          .catch(function (err) { showError(err.message); });
      });
    });
  }

  // ── Add Role ────────────────────────────────────────────────

  $('btn-add-role').addEventListener('click', function () {
    inputRoleName.value = '';
    openModal(modalAddRole);
  });

  $('btn-close-add-role').addEventListener('click', function () { closeModal(modalAddRole); });
  $('btn-cancel-add-role').addEventListener('click', function () { closeModal(modalAddRole); });

  $('btn-confirm-add-role').addEventListener('click', function () {
    var name = inputRoleName.value.trim();
    if (!name) { showError('Role name is required.'); return; }

    apiFetch('/dept-ranks/' + deptId + '/roles', {
      method: 'POST',
      body: JSON.stringify({ name: name }),
    })
      .then(function () {
        closeModal(modalAddRole);
        loadRoles();
        showSuccess('Role created.');
      })
      .catch(function (err) { showError(err.message); });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     DOCUMENTS TAB
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  function loadDocs() {
    apiFetch('/dept-docs/' + deptId)
      .then(function (rows) { renderDocs(rows || []); })
      .catch(function () { docsList.innerHTML = '<div class="dm-empty">Could not load documents.</div>'; });
  }

  function renderDocs(docs) {
    docsList.innerHTML = '';
    if (!docs.length) {
      docsList.innerHTML = '<div class="dm-empty">No documents yet. Add links to policies, SOPs, etc.</div>';
      return;
    }

    docs.forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'dm-row';
      row.innerHTML =
        '<span class="dm-cell" style="flex:1">' + esc(d.title) + '</span>' +
        '<span class="dm-cell" style="width:26rem">' +
          '<a class="dm-doc-link" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.url.substring(0, 50)) + (d.url.length > 50 ? '…' : '') + '</a>' +
        '</span>' +
        '<span class="dm-cell" style="width:6rem">' +
          '<button class="dm-row-btn dm-row-btn--del" data-id="' + d.id + '">Delete</button>' +
        '</span>';
      docsList.appendChild(row);
    });

    docsList.querySelectorAll('.dm-row-btn--del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (!confirm('Delete this document?')) return;
        apiFetch('/dept-docs/' + id, { method: 'DELETE' })
          .then(function () { loadDocs(); showSuccess('Document deleted.'); })
          .catch(function (err) { showError(err.message); });
      });
    });
  }

  // ── Add Doc ─────────────────────────────────────────────────

  $('btn-add-doc').addEventListener('click', function () {
    inputDocTitle.value = '';
    inputDocUrl.value = '';
    openModal(modalAddDoc);
  });

  $('btn-close-add-doc').addEventListener('click', function () { closeModal(modalAddDoc); });
  $('btn-cancel-add-doc').addEventListener('click', function () { closeModal(modalAddDoc); });

  $('btn-confirm-add-doc').addEventListener('click', function () {
    var title = inputDocTitle.value.trim();
    var url   = inputDocUrl.value.trim();
    if (!title || !url) { showError('Title and URL are required.'); return; }

    apiFetch('/dept-docs', {
      method: 'POST',
      body: JSON.stringify({ deptId: Number(deptId), title: title, url: url }),
    })
      .then(function () {
        closeModal(modalAddDoc);
        loadDocs();
        showSuccess('Document added.');
      })
      .catch(function (err) { showError(err.message); });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     INFRACTIONS TAB
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  // ── Give Infraction ─────────────────────────────────────────

  function openGiveInfraction(memberId, username) {
    infractingMemberId = memberId;
    infractingMemberName = username;
    infractionModalTitle.textContent = 'Give Infraction — ' + esc(username);
    inputInfractionReason.value = '';
    openModal(modalGiveInfraction);
  }

  $('btn-close-infraction').addEventListener('click', function () { closeModal(modalGiveInfraction); });
  $('btn-cancel-infraction').addEventListener('click', function () { closeModal(modalGiveInfraction); });

  $('btn-confirm-infraction').addEventListener('click', function () {
    var reason = inputInfractionReason.value.trim();
    if (!reason) { showError('Reason is required.'); return; }

    apiFetch('/dept-infractions', {
      method: 'POST',
      body: JSON.stringify({ deptId: Number(deptId), memberId: infractingMemberId, reason: reason }),
    })
      .then(function () {
        closeModal(modalGiveInfraction);
        loadMembers();
        showSuccess('Infraction recorded.');
      })
      .catch(function (err) { showError(err.message); });
  });

  // ── View Infractions popup ─────────────────────────────────--

  // When clicking an infraction badge, fetch and show a popup
  // (delegated listener attached to membersList)
  membersList.addEventListener('click', function (e) {
    var badge = e.target.closest('.dm-infraction-badge');
    if (!badge) return;
    var memberId = badge.getAttribute('data-member-id');
    if (!memberId) return;

    // Remove any existing popup
    var existing = document.querySelector('.dm-infraction-popup');
    if (existing) existing.remove();

    // If clicking the same badge, just toggle off
    if (badge.dataset.popupOpen === 'true') {
      badge.dataset.popupOpen = 'false';
      return;
    }

    badge.dataset.popupOpen = 'true';

    apiFetch('/dept-infractions/' + deptId + '/member/' + memberId)
      .then(function (infractions) {
        var popup = document.createElement('div');
        popup.className = 'dm-infraction-popup';

        var html = '<div class="dm-infraction-popup-title">Infractions</div>';
        if (!infractions.length) {
          html += '<div class="dm-infraction-popup-empty">No infractions on record.</div>';
        } else {
          infractions.forEach(function (inf) {
            html += '<div class="dm-infraction-popup-item">' +
              esc(inf.reason) +
              '<small>By ' + esc(inf.given_by_name || 'Unknown') + ' on ' + esc(new Date(inf.created_at).toLocaleDateString()) + '</small>' +
              '</div>';
          });
        }

        popup.innerHTML = html;
        document.body.appendChild(popup);

        // Position popup near the badge
        var rect = badge.getBoundingClientRect();
        popup.style.left = Math.min(rect.left, window.innerWidth - popup.offsetWidth - 10) + 'px';
        popup.style.top = (rect.bottom + 6) + 'px';

        // Close on click outside
        var closeHandler = function (ev) {
          if (!popup.contains(ev.target) && ev.target !== badge) {
            badge.dataset.popupOpen = 'false';
            popup.remove();
            document.removeEventListener('click', closeHandler);
          }
        };
        setTimeout(function () { document.addEventListener('click', closeHandler); }, 10);
      })
      .catch(function () {});
  });

  /* ── Infract action (delegated) ───────────────────────────── */
  membersList.addEventListener('click', function (e) {
    var btn = e.target.closest('.dm-row-btn--infract');
    if (!btn) return;
    var memberId = btn.getAttribute('data-id');
    var username = btn.getAttribute('data-username');
    if (!memberId) return;

    // Fetch current infractions first so the badge count is up to date
    openGiveInfraction(Number(memberId), username || 'Unknown');
  });

  /* ── Promote action ───────────────────────────────────────── */

  // Wire promote buttons (delegated on membersList)
  membersList.addEventListener('click', function (e) {
    var btn = e.target.closest('.dm-row-btn--promote');
    if (!btn) return;
    var memberId = btn.getAttribute('data-id');
    if (!memberId) return;
    var newRankId = btn.getAttribute('data-rank-id');

    apiFetch('/dept-members/' + memberId, {
      method: 'PATCH',
      body: JSON.stringify({ rankId: newRankId ? Number(newRankId) : null }),
    })
      .then(function () {
        loadMembers();
        showSuccess('Rank updated.');
      })
      .catch(function (err) { showError(err.message); });
  });

  /* ── Set min activity ─────────────────────────────────────── */

  btnSetMinActivity.addEventListener('click', function () {
    var val = parseInt(inputMinActivity.value, 10);
    if (isNaN(val) || val < 0) { showError('Enter a valid non-negative number.'); return; }

    apiFetch('/dept-activity/' + deptId + '/min-activity', {
      method: 'PATCH',
      body: JSON.stringify({ minWeeklyActivity: val }),
    })
      .then(function () {
        minWeeklyActivity = val;
        showSuccess('Min weekly activity set to ' + val + '.');
        loadMembers();
      })
      .catch(function (err) { showError(err.message); });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     VEHICLES TAB
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  function loadDeptSettings() {
    if (!deptData) return;
    chkAssignedVehicles.checked = !!deptData.assigned_vehicles_enabled;
  }

  function loadVehicles() {
    apiFetch('/dept-vehicles/' + deptId)
      .then(function (rows) { renderVehicles(rows || []); })
      .catch(function () { vehiclesList.innerHTML = '<div class="dm-empty">Could not load vehicles.</div>'; });
  }

  function renderVehicles(vehicles) {
    vehiclesList.innerHTML = '';
    if (!vehicles.length) {
      vehiclesList.innerHTML = '<div class="dm-empty">No vehicles added yet. Add vehicles for members to select when clocking in.</div>';
      return;
    }

    vehicles.forEach(function (v) {
      var row = document.createElement('div');
      row.className = 'dm-row';

      var assigned = '';
      if (v.assigned_unit_name) {
        assigned = esc(v.assigned_unit_name);
        if (v.assigned_unit_callsign) assigned += ' (' + esc(v.assigned_unit_callsign) + ')';
      } else {
        assigned = '<span class="dm-cell--muted">Available</span>';
      }

      row.innerHTML =
        '<span class="dm-cell" style="flex:1">' + esc(v.name) + '</span>' +
        '<span class="dm-cell" style="width:10rem">' + (v.model ? esc(v.model) : '<span class="dm-cell--muted">—</span>') + '</span>' +
        '<span class="dm-cell" style="width:8rem">' + (v.plate ? esc(v.plate) : '<span class="dm-cell--muted">—</span>') + '</span>' +
        '<span class="dm-cell" style="width:8rem">' + (v.color ? esc(v.color) : '<span class="dm-cell--muted">—</span>') + '</span>' +
        '<span class="dm-cell" style="width:14rem">' + assigned + '</span>' +
        '<span class="dm-cell" style="width:6rem">' +
          '<button class="dm-row-btn dm-row-btn--edit" data-id="' + v.id + '" data-name="' + esc(v.name) + '" data-model="' + esc(v.model || '') + '" data-plate="' + esc(v.plate || '') + '" data-color="' + esc(v.color || '') + '">Edit</button>' +
          '<button class="dm-row-btn dm-row-btn--del" data-id="' + v.id + '">Delete</button>' +
        '</span>';

      vehiclesList.appendChild(row);
    });

    // Wire edit and delete buttons
    vehiclesList.querySelectorAll('.dm-row-btn--edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openEditVehicle(btn);
      });
    });

    vehiclesList.querySelectorAll('.dm-row-btn--del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (!confirm('Delete this vehicle? It will be unassigned from any unit using it.')) return;
        apiFetch('/dept-vehicles/' + id, { method: 'DELETE' })
          .then(function () { loadVehicles(); showSuccess('Vehicle deleted.'); })
          .catch(function (err) { showError(err.message); });
      });
    });
  }

  // ── Add Vehicle ──────────────────────────────────────────────

  $('btn-add-vehicle').addEventListener('click', function () {
    inputVehName.value = '';
    inputVehModel.value = '';
    inputVehPlate.value = '';
    inputVehColor.value = '';
    openModal(modalAddVehicle);
  });

  $('btn-close-add-vehicle').addEventListener('click', function () { closeModal(modalAddVehicle); });
  $('btn-cancel-add-vehicle').addEventListener('click', function () { closeModal(modalAddVehicle); });

  $('btn-confirm-add-vehicle').addEventListener('click', function () {
    var name = inputVehName.value.trim();
    if (!name) { showError('Vehicle name is required.'); return; }

    apiFetch('/dept-vehicles', {
      method: 'POST',
      body: JSON.stringify({
        deptId: Number(deptId),
        name: name,
        model: inputVehModel.value.trim() || null,
        plate: inputVehPlate.value.trim() || null,
        color: inputVehColor.value.trim() || null,
      }),
    })
      .then(function () {
        closeModal(modalAddVehicle);
        loadVehicles();
        showSuccess('Vehicle added.');
      })
      .catch(function (err) { showError(err.message); });
  });

  // ── Edit Vehicle ─────────────────────────────────────────────

  function openEditVehicle(btn) {
    editingVehicleId = btn.getAttribute('data-id');
    var titleEl = $('edit-vehicle-title');
    if (titleEl) titleEl.textContent = 'Edit — ' + (btn.getAttribute('data-name') || 'Vehicle');
    inputEditVehName.value = btn.getAttribute('data-name') || '';
    inputEditVehModel.value = btn.getAttribute('data-model') || '';
    inputEditVehPlate.value = btn.getAttribute('data-plate') || '';
    inputEditVehColor.value = btn.getAttribute('data-color') || '';
    openModal(modalEditVehicle);
  }

  $('btn-close-edit-vehicle').addEventListener('click', function () { closeModal(modalEditVehicle); });
  $('btn-cancel-edit-vehicle').addEventListener('click', function () { closeModal(modalEditVehicle); });

  $('btn-confirm-edit-vehicle').addEventListener('click', function () {
    var name = inputEditVehName.value.trim();
    if (!name) { showError('Vehicle name is required.'); return; }

    apiFetch('/dept-vehicles/' + editingVehicleId, {
      method: 'PATCH',
      body: JSON.stringify({
        name: name,
        model: inputEditVehModel.value.trim() || null,
        plate: inputEditVehPlate.value.trim() || null,
        color: inputEditVehColor.value.trim() || null,
      }),
    })
      .then(function () {
        closeModal(modalEditVehicle);
        loadVehicles();
        showSuccess('Vehicle updated.');
      })
      .catch(function (err) { showError(err.message); });
  });

  // ── Toggle assigned vehicles ─────────────────────────────────

  chkAssignedVehicles.addEventListener('change', function () {
    apiFetch('/departments/' + deptId, {
      method: 'PATCH',
      body: JSON.stringify({ assignedVehiclesEnabled: chkAssignedVehicles.checked }),
    })
      .then(function (dept) {
        deptData = dept;
        showSuccess('Assigned vehicles ' + (dept.assigned_vehicles_enabled ? 'enabled' : 'disabled') + '.');
      })
      .catch(function (err) {
        chkAssignedVehicles.checked = !chkAssignedVehicles.checked;
        showError(err.message);
      });
  });

  /* ── Kick off ─────────────────────────────────────────────── */
  init();

})();

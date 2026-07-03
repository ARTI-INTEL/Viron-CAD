/**
 * server-page.js  Ultimate CAD Server Page
 *
 * Responsibilities:
 *  - Populate the welcome greeting (server name + username)
 *  - Detect if the current user is the server owner and show
 *    the "Server Settings" button accordingly
 *  - Validate and submit clock-in for each department (LEO / F&R / DOT)
 *    via POST /units/clock-in
 *  - Navigate to the appropriate CAD page on success
 *  - Wire Civilian/Character and Dispatcher bottom buttons
 *
 * No inline event handlers or inline styles anywhere in the HTML.
 * All DOM wiring lives here.
 */

(function () {
  'use strict';

  /* ── Config ──────────────────────────────────────────────── */
  const API_BASE = '';   // same origin; change to 'http://localhost:5000' if needed

  /* ── Storage helpers ─────────────────────────────────────── */
  function get(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function set(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
  }

  /* ── Cached values ───────────────────────────────────────── */
  const serverId   = get('cad_active_server');
  const serverName = get('cad_active_server_name') || 'Unknown Server';
  const username   = get('cad_username')           || 'Unit';
  const userId     = get('cad_user_id');            // internal DB id (iduser)

  /* ── Element refs ────────────────────────────────────────── */
  const root          = document.getElementById('server-root');
  const welcomeText   = document.getElementById('sp-welcome-text');
  const btnDashboard  = document.getElementById('btn-dashboard');
  const btnSettings   = document.getElementById('btn-server-settings');
  const btnCivilian   = document.getElementById('btn-civilian');
  const btnDispatcher = document.getElementById('btn-dispatcher');

  /* Dept: name, callsign, rank, department input ids; error id; button id; CAD url */
  const DEPTS = [
    {
      prefix:     'leo',
      department: 'Law Enforcement',
      typeCode:   'LEO',
      cadUrl:     'leo-cad.html',
    },
    {
      prefix:     'fr',
      department: 'Fire and Rescue',
      typeCode:   'FR',
      cadUrl:     'fr-cad.html',
    },
    {
      prefix:     'dot',
      department: 'Department of Transport',
      typeCode:   'DOT',
      cadUrl:     'dot-cad.html',
    },
  ];

  /* ── Greeting ────────────────────────────────────────────── */
  welcomeText.textContent = 'Welcome to ' + serverName + ', ' + username;

  /* ── Owner detection ─────────────────────────────────────── */
  (function checkOwner() {
    if (!serverId) return;

    fetch(API_BASE + '/servers/name/' + serverId)
      .then(function (r) { return r.json(); })
      .then(function (server) {
        // server.owner_id is the iduser of the owner (from DB_Structure.sql)
        if (userId && String(server.owner_id) === String(userId)) {
          root.classList.add('sp-owner');
        }
      })
      .catch(function () {
        // Network unavailable or dev mode  silently skip owner check
      });
  })();

  /* ── Server Settings navigation ─────────────────────────── */
  btnSettings.addEventListener('click', function () {
    window.location.href = 'server-settings.html';
  });

  /* ── Dashboard navigation ────────────────────────────────── */
  btnDashboard.addEventListener('click', function () {
    window.location.href = 'dashboard.html';
  });

  /* ── Civilian / Dispatcher buttons ──────────────────────── */
  btnCivilian.addEventListener('click', function () {
    window.location.href = 'civilian.html';
  });

  btnDispatcher.addEventListener('click', function () {
    window.location.href = 'dispatcher-cad.html';
  });

  /* ── Dept clock-in ───────────────────────────────────────── */

  /**
   * Show an error message inside the panel.
   */
  function showError(prefix, msg) {
    var el = document.getElementById(prefix + '-error');
    if (el) el.textContent = msg;
  }

  /**
   * Clear error message.
   */
  function clearError(prefix) {
    var el = document.getElementById(prefix + '-error');
    if (el) el.textContent = '';
  }

  /**
   * Read a field value by its id, trimmed.
   */
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /**
   * Attempt to clock in, then navigate to the CAD page.
   * Matches POST /units/clock-in  (units.routes.js)
   * Body: { serverId, name, callsign, department }
   * Header: x-user-id
   */
  function clockIn(dept) {
    clearError(dept.prefix);

    var name       = val(dept.prefix + '-name');
    var callsign   = val(dept.prefix + '-callsign');
    var rank       = val(dept.prefix + '-rank');
    var department = val(dept.prefix + '-department') || dept.department;

    /* Basic client-side validation */
    if (!name || !callsign) {
      showError(dept.prefix, 'Name and Callsign are required.');
      return;
    }

    if (!serverId) {
      showError(dept.prefix, 'No active server  please return to the dashboard.');
      return;
    }

    /* Disable the button while the request is in flight */
    var btn = document.getElementById('btn-join-' + dept.prefix);
    btn.classList.add('sp-loading');
    btn.textContent = 'Joining…';

    fetch(API_BASE + '/units/clock-in', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id':    userId || '',
      },
      body: JSON.stringify({
        serverId:   Number(serverId),
        name:       name + (rank ? ' (' + rank + ')' : ''),
        callsign:   callsign,
        department: department,
      }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Server error'); });
        return r.json();
      })
      .then(function (unit) {
        /* Persist the unit session id for the CAD page */
        set('cad_unit_id', unit.id);
        set('cad_unit_dept', dept.prefix);
        set('cad_department', department);
        window.location.href = dept.cadUrl;
      })
      .catch(function (err) {
        showError(dept.prefix, err.message || 'Clock-in failed. Please try again.');
        btn.classList.remove('sp-loading');
        btn.textContent = 'Join ' + (dept.prefix === 'leo' ? 'LEO' : dept.prefix === 'fr' ? 'F&R' : 'DOT') + ' CAD';
      });
  }

  /* ── Load custom departments ───────────────────────────────── */
  /**
   * Populate each department <select> with server-owner-defined departments
   * matching that panel's type. If none exist for a type, the select keeps
   * its single default option (e.g. "Law Enforcement") and behaves exactly
   * like before.
   */
  function loadDepartments() {
    if (!serverId) return;

    fetch(API_BASE + '/departments/' + serverId, {
      headers: { 'x-user-id': userId || '' },
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        DEPTS.forEach(function (dept) {
          var select = document.getElementById(dept.prefix + '-department');
          if (!select) return;

          var matches = rows.filter(function (d) { return d.type === dept.typeCode; });
          if (!matches.length) return; // keep default option

          select.innerHTML = '';
          matches.forEach(function (d) {
            var opt = document.createElement('option');
            opt.value = d.name;
            opt.textContent = d.name;
            select.appendChild(opt);
          });
        });
      })
      .catch(function () {
        // Offline or no departments configured — selects keep their defaults
      });
  }

  /* Wire each department join button */
  DEPTS.forEach(function (dept) {
    var btn = document.getElementById('btn-join-' + dept.prefix);
    if (!btn) return;
    btn.addEventListener('click', function () { clockIn(dept); });
  });

  /* ── Load dept memberships (for Manage Department buttons) ──── */
  function loadDeptMemberships() {
    if (!userId || !serverId) return;

    fetch(API_BASE + '/dept-members/me', {
      headers: { 'x-user-id': userId || '' },
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (memberships) {
        memberships.forEach(function (m) {
          var perms = m.permissions || [];
          if (typeof perms === 'string') {
            try { perms = JSON.parse(perms); } catch (_) { perms = []; }
          }
          if (!perms.includes('HR_ACCESS')) return;

          // Find which panel this dept belongs to
          var deptType = (m.dept_type || '').toLowerCase();
          var panelPrefix = deptType; // leo, fr, dot
          var panel = document.getElementById('panel-' + panelPrefix);
          if (!panel) return;

          // Check if a manage btn already exists on this panel
          var existing = panel.querySelector('.sp-manage-btn');
          if (existing) return;

          var manageBtn = document.createElement('button');
          manageBtn.className = 'sp-manage-btn';
          manageBtn.textContent = 'Manage Department';
          manageBtn.addEventListener('click', function () {
            window.location.href = 'dept-manage.html?deptId=' + m.dept_id;
          });
          panel.appendChild(manageBtn);
        });
      })
      .catch(function () {});
  }

  /* Load custom departments */
  loadDepartments();
  loadDeptMemberships();

})();
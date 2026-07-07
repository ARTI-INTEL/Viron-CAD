/**
 * bodycam-ui.js  Ultimate CAD – Bodycam UI Module
 *
 * Shared across all CAD pages (leo, fr, dot, dispatcher).
 * Provides:
 *   - Bodycam record/stop button in navbar
 *   - Call notes viewer modal
 *   - Supervisor bodycam request flow
 *   - Clock-in upload prompt for pending requests
 *
 * Dependencies: CAD global (shared.js), Toast
 */

(function (global) {
  'use strict';

  var _recording = false;
  var _recordingId = null;
  var _recordingFileName = null;

  /* ── Render call notes in a modal ────────────────────────── */
  function openCallNotes(callId) {
    var modal = document.getElementById('bc-call-notes-modal');
    var list  = document.getElementById('bc-call-notes-list');
    if (!modal || !list) return;

    list.innerHTML = '<div style="padding:1rem;color:rgba(255,255,255,0.4);">Loading notes…</div>';
    modal.classList.add('open');

    CAD.apiFetch('/call-notes/' + callId)
      .then(function (notes) {
        if (!notes || !notes.length) {
          list.innerHTML = '<div style="padding:1rem;color:rgba(255,255,255,0.4);">No notes for this call.</div>';
          return;
        }
        list.innerHTML = notes.map(function (n) {
          var icon = n.type === 'bodycam' ? '📹' : n.type === 'attach' ? '🔗' : n.type === 'detach' ? '🔌' : n.type === 'update' ? '✏️' : '📋';
          var ts = n.created_at ? new Date(n.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
          var name = n.created_name || '';
          return '<div class="bc-note-row">' +
            '<span class="bc-note-icon">' + icon + '</span>' +
            '<span class="bc-note-text">' + CAD.esc(n.message) + '</span>' +
            '<span class="bc-note-meta">' + CAD.esc(name ? name + ' · ' : '') + ts + '</span>' +
            '</div>';
        }).join('');
      })
      .catch(function () {
        list.innerHTML = '<div style="padding:1rem;color:rgba(255,255,255,0.4);">Failed to load notes.</div>';
      });
  }

  /* ── Bodycam buttons ─────────────────────────────────────── */
  function initBodycamButton(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    // Match the navbar's button class for consistent styling
    var btnClass = '';
    if (container.classList.contains('leo-navbar')) btnClass = 'leo-btn';
    else if (container.classList.contains('d-navbar')) btnClass = 'd-btn';
    else if (container.classList.contains('fr-navbar')) btnClass = 'fr-btn';
    else if (container.classList.contains('dot-navbar')) btnClass = 'dot-btn';

    var btn = document.createElement('button');
    btn.id = 'bc-record-btn';
    btn.className = btnClass + ' bc-btn';
    btn.innerHTML = '<span class="bc-btn-icon">●</span> Bodycam';
    btn.title = 'Start bodycam recording (requires Electron desktop app)';
    container.appendChild(btn);

    var indicator = document.createElement('div');
    indicator.id = 'bc-recording-indicator';
    indicator.className = 'bc-indicator';
    indicator.style.display = 'none';
    indicator.innerHTML = '<span class="bc-indicator-dot"></span> REC';
    container.appendChild(indicator);

    btn.addEventListener('click', function () {
      if (_recording) {
        stopBodycam();
      } else {
        startBodycam();
      }
    });
  }

  function startBodycam() {
    var serverId = CAD.get('cad_active_server');
    var callId = CAD.get('cad_current_call') || null;
    var unitId = CAD.get('cad_unit_id') || null;
    var userId = CAD.get('cad_user_id');

    // Always call server API first to log activation
    CAD.apiFetch('/bodycam/activate', {
      method: 'POST',
      body: JSON.stringify({ serverId: Number(serverId), callId: callId ? Number(callId) : null, unitId: unitId ? Number(unitId) : null }),
    })
      .then(function (result) {
        _recordingId = result.id;
        _recordingFileName = result.fileName || ('bc_' + userId + '_' + (callId || '0') + '_' + new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19) + '.webm');

        if (typeof window.__electronBodycam !== 'undefined' && window.__electronBodycam.start) {
          // Electron desktop app — native window recording
          return window.__electronBodycam.start({
            serverId: Number(serverId),
            callId: callId ? Number(callId) : null,
            unitId: unitId ? Number(unitId) : null,
            userId: userId,
            fileName: _recordingFileName,
          })
            .then(function () {
              setRecordingUI(true);
              if (typeof Toast !== 'undefined') Toast.success('📹 Bodycam recording started');
            });
        } else {
          setRecordingUI(true);
          if (typeof Toast !== 'undefined') Toast.info('📹 Bodycam flagged (browser mode — no recording)');
        }
      })
      .catch(function (err) {
        if (typeof Toast !== 'undefined') Toast.error('Bodycam: ' + (err.message || 'Failed'));
      });
  }

  function stopBodycam() {
    if (!_recordingId) { setRecordingUI(false); return; }

    if (typeof window.__electronBodycam !== 'undefined' && window.__electronBodycam.stop) {
      window.__electronBodycam.stop(_recordingId)
        .then(function () {
          setRecordingUI(false);
          if (typeof Toast !== 'undefined') Toast.success('📹 Bodycam recording saved');
        })
        .catch(function (err) {
          if (typeof Toast !== 'undefined') Toast.error('Bodycam: ' + (err.message || 'Failed to stop'));
        });
    } else {
      CAD.apiFetch('/bodycam/' + _recordingId + '/deactivate', { method: 'PATCH' })
        .then(function () {
          setRecordingUI(false);
          if (typeof Toast !== 'undefined') Toast.info('📹 Bodycam deactivated');
        })
        .catch(function () { setRecordingUI(false); });
    }
  }

  function setRecordingUI(active) {
    _recording = active;
    var btn = document.getElementById('bc-record-btn');
    var ind = document.getElementById('bc-recording-indicator');
    if (btn) {
      btn.classList.toggle('bc-btn--recording', active);
      btn.innerHTML = active ? '<span class="bc-btn-icon bc-btn-icon--stop">■</span> Stop' : '<span class="bc-btn-icon">●</span> Bodycam';
    }
    if (ind) ind.style.display = active ? 'flex' : 'none';
  }

  /* ── Supervisor request bodycam ───────────────────────────── */
  function requestBodycam(recordingId) {
    CAD.apiFetch('/bodycam/' + recordingId + '/request', { method: 'POST' })
      .then(function (result) {
        if (typeof Toast !== 'undefined') Toast.success('Bodycam requested from ' + (result.officerName || 'officer'));
      })
      .catch(function (err) {
        if (typeof Toast !== 'undefined') Toast.error(err.message || 'Failed to request bodycam');
      });
  }

  /* ── Clock-in upload prompt ───────────────────────────────── */
  function checkPendingBodycamRequests() {
    CAD.apiFetch('/bodycam/requests/pending')
      .then(function (requests) {
        if (!requests || !requests.length) return;
        // Show upload prompt
        var modal = document.getElementById('bc-upload-modal');
        var list  = document.getElementById('bc-upload-list');
        if (!modal || !list) return;

        list.innerHTML = requests.map(function (r) {
          return '<div class="bc-upload-row" data-id="' + r.id + '">' +
            '<span>Call #' + CAD.esc(String(r.call_id || '—')) + ' — ' + CAD.esc(r.file_name || 'Unknown') + '</span>' +
            '<button class="bc-upload-btn" data-id="' + r.id + '">Mark Uploaded</button>' +
            '</div>';
        }).join('');
        modal.classList.add('open');

        list.querySelectorAll('.bc-upload-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            btn.disabled = true;
            btn.textContent = '…';
            CAD.apiFetch('/bodycam/' + id + '/upload', { method: 'POST' })
              .then(function () {
                btn.textContent = '✓ Done';
                btn.style.background = '#00aa22';
                btn.disabled = true;
                if (typeof Toast !== 'undefined') Toast.success('Upload recorded. Share download link with your supervisor.');
              })
              .catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Retry';
                if (typeof Toast !== 'undefined') Toast.error(err.message || 'Upload failed');
              });
          });
        });
      })
      .catch(function () {});
  }

  /* ── Expose public API ───────────────────────────────────── */
  global.BodycamUI = {
    initBodycamButton: initBodycamButton,
    openCallNotes: openCallNotes,
    requestBodycam: requestBodycam,
    checkPendingBodycamRequests: checkPendingBodycamRequests,
    startBodycam: startBodycam,
    stopBodycam: stopBodycam,
  };

  /* Add the modals to the page dynamically if they don't exist */
  function ensureModals() {
    // Call notes modal
    if (!document.getElementById('bc-call-notes-modal')) {
      var notesModal = document.createElement('div');
      notesModal.id = 'bc-call-notes-modal';
      notesModal.className = 'modal-overlay';
      notesModal.innerHTML =
        '<div class="modal-box bc-modal-box">' +
          '<button class="close-btn bc-modal-close">✕</button>' +
          '<p class="bc-modal-title">Call Notes</p>' +
          '<div class="bc-notes-list" id="bc-call-notes-list"></div>' +
        '</div>';
      document.body.appendChild(notesModal);
      notesModal.addEventListener('click', function (e) {
        if (e.target === notesModal) notesModal.classList.remove('open');
      });
      notesModal.querySelector('.bc-modal-close').addEventListener('click', function () {
        notesModal.classList.remove('open');
      });
    }

    // Bodycam upload modal
    if (!document.getElementById('bc-upload-modal')) {
      var upModal = document.createElement('div');
      upModal.id = 'bc-upload-modal';
      upModal.className = 'modal-overlay';
      upModal.innerHTML =
        '<div class="modal-box bc-modal-box">' +
          '<button class="close-btn bc-modal-close">✕</button>' +
          '<p class="bc-modal-title">📹 Bodycam Upload Requested</p>' +
          '<p style="color:rgba(255,255,255,0.5);margin-bottom:1rem;font-size:0.875rem;">A supervisor has requested your bodycam footage. Please upload the files to complete the request.</p>' +
          '<div class="bc-uploads-list" id="bc-upload-list"></div>' +
        '</div>';
      document.body.appendChild(upModal);
      upModal.addEventListener('click', function (e) {
        if (e.target === upModal) upModal.classList.remove('open');
      });
      upModal.querySelector('.bc-modal-close').addEventListener('click', function () {
        upModal.classList.remove('open');
      });
    }

    // Add styles
    var style = document.createElement('style');
    style.textContent = `
      .bc-btn { display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;border-radius:0.625rem;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;font-family:Inter,sans-serif;font-size:0.875rem;font-weight:700;cursor:pointer;transition:all 0.15s; }
      .bc-btn:hover { background:rgba(255,255,255,0.15); }
      .bc-btn--recording { background:rgba(200,30,30,0.4);border-color:rgba(200,30,30,0.6);animation:bc-pulse 1.5s infinite; }
      .bc-btn-icon { font-size:1.25rem;line-height:1; }
      .bc-btn-icon--stop { color:#ff4444; }
      .bc-indicator { display:inline-flex;align-items:center;gap:0.375rem;padding:0.25rem 0.75rem;border-radius:0.5rem;background:rgba(200,30,30,0.3);color:#ff4444;font-family:Inter,sans-serif;font-size:0.75rem;font-weight:700;letter-spacing:0.05em;margin-left:0.5rem; }
      .bc-indicator-dot { width:0.5rem;height:0.5rem;border-radius:50%;background:#ff4444;animation:bc-pulse 1s infinite; }
      @keyframes bc-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      .bc-modal-box { max-width:36rem;max-height:60vh;display:flex;flex-direction:column; }
      .bc-modal-title { font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:1rem; }
      .bc-notes-list { flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:0.375rem; }
      .bc-note-row { display:flex;align-items:flex-start;gap:0.625rem;padding:0.625rem 0.75rem;background:rgba(255,255,255,0.04);border-radius:0.5rem; }
      .bc-note-icon { font-size:1.125rem;flex-shrink:0;margin-top:0.0625rem; }
      .bc-note-text { flex:1;font-size:0.875rem;color:rgba(255,255,255,0.85);line-height:1.4; }
      .bc-note-meta { font-size:0.75rem;color:rgba(255,255,255,0.35);white-space:nowrap;flex-shrink:0;margin-top:0.125rem; }
      .bc-uploads-list { display:flex;flex-direction:column;gap:0.5rem; }
      .bc-upload-row { display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem;background:rgba(255,255,255,0.04);border-radius:0.5rem;font-size:0.875rem;color:rgba(255,255,255,0.75); }
      .bc-upload-btn { height:2.25rem;padding:0 1rem;border-radius:0.5rem;border:none;background:rgba(41,84,195,0.3);color:#7eaaff;font-family:Inter,sans-serif;font-size:0.8125rem;font-weight:700;cursor:pointer;white-space:nowrap; }
      .bc-upload-btn:hover { background:rgba(41,84,195,0.45); }
    `;
    document.head.appendChild(style);
  }

  // ── Event delegation: Notes + supervisor bodycam request ─
  document.addEventListener('click', function (e) {
    var notesBtn = e.target.closest('.leo-notes-btn, .d-notes-btn, .fr-notes-btn, .dot-notes-btn');
    if (notesBtn) {
      var callId = notesBtn.getAttribute('data-id');
      openCallNotes(callId);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    var reqBtn = e.target.closest('.bc-sup-request-btn');
    if (reqBtn) {
      var recId = reqBtn.getAttribute('data-recording-id');
      if (recId && typeof global.BodycamUI !== 'undefined') {
        global.BodycamUI.requestBodycam(recId);
      }
      e.preventDefault();
      e.stopPropagation();
    }
  });

  ensureModals();
  global.addEventListener('load', function () {
    checkPendingBodycamRequests();

    // Only show bodycam button in the Electron desktop app
    if (typeof global.__electronBodycam === 'undefined') return;

    var navbar = document.querySelector('.leo-navbar, .d-navbar, .fr-navbar, .dot-navbar');
    if (navbar) {
      navbar.id = navbar.id || 'bc-navbar';
      initBodycamButton(navbar.id);
    }
  });

})(window);

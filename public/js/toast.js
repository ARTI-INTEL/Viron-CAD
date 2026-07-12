/**
 * toast.js  Viron CAD – Toast Notification Utility
 * Provides window.Toast with typed methods AND overrides the native
 * window.alert() so all existing alert() calls across the entire
 * codebase automatically render as non-blocking toast notifications.
 *
 * Load this script (after toast.css) on every page, before any
 * page-specific scripts.
 *
 * API:
 *   Toast.success('Character created!');
 *   Toast.error('Name is required.');
 *   Toast.warning('Callsign field is empty.');
 *   Toast.info('Polling for live data…');
 *   Toast.error('Something went wrong.', 7000);  // optional duration ms
 */

(function (window) {
  'use strict';

  var ICONS = { success: '✓', error: '✕', warning: '!', info: 'i' };

  var DEFAULTS = { success: 3500, error: 6000, warning: 4500, info: 4000 };

  var container = null;

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'false');
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type, duration) {
    type     = type || 'info';
    duration = (duration === undefined || duration === null) ? DEFAULTS[type] || 4000 : duration;

    var c = getContainer();

    /* Build DOM */
    var toast = document.createElement('div');
    toast.className = 'toast toast--' + type;
    toast.setAttribute('role', 'alert');

    var iconEl = document.createElement('span');
    iconEl.className = 'toast__icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = ICONS[type] || 'i';

    var msgEl = document.createElement('span');
    msgEl.className = 'toast__msg';
    msgEl.textContent = String(message);

    var closeEl = document.createElement('button');
    closeEl.className = 'toast__close';
    closeEl.setAttribute('type', 'button');
    closeEl.setAttribute('aria-label', 'Dismiss');
    closeEl.textContent = '✕';

    var progressEl = document.createElement('div');
    progressEl.className = 'toast__progress';

    toast.appendChild(iconEl);
    toast.appendChild(msgEl);
    toast.appendChild(closeEl);
    if (duration > 0) toast.appendChild(progressEl);

    c.appendChild(toast);

    /* Animate in — double rAF ensures the transition fires */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add('toast--show');
      });
    });

    var dismissTimer = null;

    if (duration > 0) {
      /* Shrink progress bar after the show transition (~320 ms) */
      setTimeout(function () {
        var dur = Math.max(duration - 320, 0);
        progressEl.style.transition = 'transform ' + dur + 'ms linear';
        progressEl.style.transform  = 'scaleX(0)';
      }, 320);

      dismissTimer = setTimeout(dismiss, duration);
    }

    function dismiss() {
      if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
      toast.classList.remove('toast--show');
      toast.classList.add('toast--hide');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }

    closeEl.addEventListener('click', function (e) {
      e.stopPropagation();
      dismiss();
    });

    return { dismiss: dismiss };
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.Toast = {
    success : function (msg, ms) { return show(msg, 'success', ms); },
    error   : function (msg, ms) { return show(msg, 'error',   ms); },
    warning : function (msg, ms) { return show(msg, 'warning', ms); },
    info    : function (msg, ms) { return show(msg, 'info',    ms); },
  };

  /* ── alert() override ────────────────────────────────────────
     Every legacy alert() call in the codebase becomes a non-blocking
     toast.  Type is inferred from message keywords so colour coding
     stays semantically correct without modifying any other JS file.
  ──────────────────────────────────────────────────────────────── */

  function inferType(message) {
    var lower = String(message).toLowerCase();
    if (/\b(success|submitted|created|saved|updated|removed|deleted|linked|sent|joined)\b/.test(lower)) {
      return 'success';
    }
    if (/\b(error|fail|failed|invalid|not found|forbidden|server error|api error|wrong|could not)\b/.test(lower)) {
      return 'error';
    }
    if (/\b(required|must|cannot|missing|empty|enter|select|please|offline)\b/.test(lower)) {
      return 'warning';
    }
    return 'info';
  }

  window.alert = function (message) {
    var type = inferType(message);
    show(message, type);
    /* Also log to console so nothing is lost during development */
    if (window.console && console.info) {
      console.info('[Toast] [' + type.toUpperCase() + ']', message);
    }
  };

})(window);
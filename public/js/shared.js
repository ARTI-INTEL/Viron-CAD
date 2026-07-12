/**
 * shared.js  Viron CAD – Shared Utility Functions
 *
 * Common helpers used across all CAD pages. Include this script
 * BEFORE the page-specific script on every page.
 *
 * Usage:
 *   <script src="js/shared.js"></script>
 *   <script src="js/leo.js"></script>
 */

(function (global) {
  'use strict';

  /* ── localStorage helpers ────────────────────────────────── */
  function get(key)      { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function set(key, val) { try { localStorage.setItem(key, val);   } catch (_) {} }
  function remove(key)   { try { localStorage.removeItem(key);     } catch (_) {} }

  /* ── HTML escaping ───────────────────────────────────────── */
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Age calculation from D.O.B. string ──────────────────── */
  function calcAge(dobStr) {
    if (!dobStr) return '';
    var parts = dobStr.split('/');
    var dob = parts.length === 3
      ? new Date(parts[2], parts[0] - 1, parts[1])
      : new Date(dobStr);
    if (isNaN(dob.getTime())) return '';
    return Math.floor((Date.now() - dob) / (365.25 * 24 * 3600 * 1000));
  }

  /* ── Generic API fetch wrapper ───────────────────────────── */
  function apiFetch(url, opts) {
    var token = get('cad_token') || '';
    return fetch(url, Object.assign({
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
    }, opts || {}))
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'API error'); });
        return r.json();
      });
  }

  /* ── Priority class helper ───────────────────────────────── */
  function priClass(p) {
    return { Low: 'pri-low', Medium: 'pri-medium', High: 'pri-high', Critical: 'pri-critical' }[p] || '';
  }

  /* ── Priority colour helper ──────────────────────────────── */
  function priColor(p) {
    return { Low: '#00ff2f', Medium: '#ffbb00', High: '#ff8800', Critical: '#ff0004' }[p] || '#fff';
  }

  /* ── rem conversion ──────────────────────────────────────── */
  function toRem(value) {
    return (value / 16) + 'rem';
  }

  /* ── PDF download helper ───────────────────────────────────
     Fetches a PDF via the auth header (Bearer token) and
     triggers a browser download via blob URL.                  */
  function downloadPdf(url, filename) {
    var token = get('cad_token') || '';
    return fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Failed to download PDF'); });
        return r.blob();
      })
      .then(function (blob) {
        var objUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = objUrl;
        a.download = filename || 'report.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(objUrl); }, 1000);
      });
  }

  /* ── Expose on global scope ─────────────────────────────── */
  global.CAD = {
    get:     get,
    set:     set,
    remove:  remove,
    esc:     esc,
    calcAge: calcAge,
    apiFetch: apiFetch,
    priClass: priClass,
    priColor: priColor,
    toRem:    toRem,
    downloadPdf: downloadPdf,
  };

}(window));

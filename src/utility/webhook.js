/**
 * webhook.js — Discord Webhook Utility
 *
 * Sends embedded messages to Discord webhooks using template-driven
 * embed structures defined in src/config/webhook-templates.json.
 *
 * Templates use {{placeholder}} syntax. Placeholders are replaced
 * at runtime with actual values. Any field whose resolved value is
 * empty is automatically omitted from the embed.
 *
 * Uses native fetch — zero additional dependencies.
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {object|null} */
let _templates = null;

/**
 * Load (or reload) the webhook templates from the JSON config file.
 * Results are cached in memory for the lifetime of the process.
 */
function loadTemplates() {
  if (_templates) return _templates;
  const configPath = path.resolve(__dirname, '..', 'config', 'webhook-templates.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    _templates = JSON.parse(raw);
    return _templates;
  } catch (err) {
    console.warn('[Webhook] Failed to load templates:', err.message);
    _templates = {};
    return _templates;
  }
}

/**
 * Deep-clone a plain object/array (no functions, no Dates).
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Replace {{placeholders}} in a string with values from the context object.
 * If a placeholder is not found in context, it stays as-is.
 * If the resolved value is empty (null/undefined/empty string), returns null
 * so the caller can skip the field entirely.
 *
 * @param {string} str   - Template string containing {{placeholder}} tokens
 * @param {object} ctx   - Map of placeholder -> value
 * @returns {string|null}
 */
function resolvePlaceholders(str, ctx) {
  let result = str;
  let hasEmpty = false;

  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = ctx[key];
    if (val === null || val === undefined || val === '') {
      hasEmpty = true;
      return '';
    }
    return String(val);
  });

  if (hasEmpty && result.trim() === '') return null;
  return result;
}

/**
 * Walk through a template structure (object/array/string) and replace all
 * {{placeholder}} tokens with values from the context. Empty-string fields
 * and empty-string array items are removed from the result.
 *
 * @param {any}  node  - A template node (could be object, array, string, etc.)
 * @param {object} ctx  - Placeholder -> value map
 * @returns {any} The resolved node, or null if the node resolved empty
 */
function resolveNode(node, ctx) {
  if (typeof node === 'string') {
    // Only process strings that contain placeholders
    if (node.includes('{{')) {
      return resolvePlaceholders(node, ctx);
    }
    return node;
  }

  if (Array.isArray(node)) {
    const resolved = node
      .map((item) => resolveNode(item, ctx))
      .filter((item) => item !== null && item !== undefined && item !== '');
    return resolved.length ? resolved : null;
  }

  if (node && typeof node === 'object') {
    const resolved = {};
    for (const [key, value] of Object.entries(node)) {
      let r = resolveNode(value, ctx);
      // Discord embed color must be a number, not a string
      if (key === 'color' && typeof r === 'string') {
        const parsed = Number(r);
        if (!isNaN(parsed)) r = parsed;
      }
      if (r !== null && r !== undefined && r !== '') {
        resolved[key] = r;
      }
    }
    return Object.keys(resolved).length ? resolved : null;
  }

  return node;
}

/* ── Send a generic webhook payload ─────────────────────────── */
export async function sendWebhook(webhookUrl, payload) {
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[Webhook] HTTP ${res.status} for ${webhookUrl.substring(0, 60)}… ${text.substring(0, 120)}`);
    }
  } catch (_) {
    // Silent – webhook failures must never break the main flow
  }
}

/* ── Colour mapping for audit actions ──────────────────────── */
const AUDIT_COLORS = {
  MEMBER_KICKED:        0xe74c3c,
  CALL_CREATED:         0x3498db,
  CALL_CLOSED:          0x95a5a6,
  REPORT_EDITED:        0xf39c12,
  REPORT_DELETED:       0xe74c3c,
  INFRACTION_GIVEN:     0xe74c3c,
  INFRACTION_REMOVED:   0x2ecc71,
  FIREARM_MARKED_STOLEN:    0xe74c3c,
  FIREARM_MARKED_RECOVERED: 0x2ecc71,
  VEHICLE_MARKED_STOLEN:    0xe74c3c,
  VEHICLE_MARKED_RECOVERED: 0x2ecc71,
};
const DEFAULT_COLOR = 0x5865f2; // Discord blurple

/**
 * Build the context values object for an audit event.
 */
function buildAuditContext(event) {
  const actionStr = String(event.action || '—').replace(/_/g, ' ');
  const color = AUDIT_COLORS[event.action] || DEFAULT_COLOR;

  let lines = [];
  lines.push(`**Action:** ${actionStr}`);
  lines.push(`**User:** ${event.username || 'Unknown'}`);

  if (event.target_type) {
    const targetStr = event.target_type + (event.target_id ? ` #${event.target_id}` : '');
    lines.push(`**Target:** ${targetStr}`);
  }

  if (event.details && typeof event.details === 'object') {
    const keys = Object.keys(event.details);
    if (keys.length) {
      const detailStr = keys
        .map((k) => `${k}: ${event.details[k] == null ? '' : String(event.details[k])}`)
        .join(' • ');
      lines.push(`**Details:** ${detailStr.length > 1000 ? detailStr.substring(0, 997) + '…' : detailStr}`);
    }
  }

  const timestamp = new Date(event.created_at || Date.now());
  lines.push(`\n┈ ${timestamp.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);

  return {
    description: lines.join('\n'),
    color: String(color),
  };
}

/**
 * Send an audit-log embed to the server's audit webhook.
 */
export async function sendAuditWebhook(webhookUrl, event) {
  if (!webhookUrl) return;
  const templates = loadTemplates();
  if (!templates.audit) return;

  const ctx = buildAuditContext(event);
  const payload = resolveNode(deepClone(templates.audit), ctx);
  if (!payload) return;

  await sendWebhook(webhookUrl, payload);
}

/* ── Send a clock-in embed ──────────────────────────────────── */
export async function sendClockInWebhook(webhookUrl, unit) {
  if (!webhookUrl) return;
  const templates = loadTemplates();
  if (!templates.clockIn) return;

  const ts = new Date();
  const lines = [
    `🟢 **Unit Clocked In**`,
    '',
    `**Officer:** ${unit.name || 'Unknown'}`,
    `**Callsign:** ${unit.callsign || '—'}`,
    `**Department:** ${unit.department || '—'}`,
    `\n┈ ${ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
  ];

  const ctx = {
    description: lines.join('\n'),
    color: '0x2ecc71',
  };

  const payload = resolveNode(deepClone(templates.clockIn), ctx);
  if (!payload) return;

  await sendWebhook(webhookUrl, payload);
}

/* ── Send a report-filed embed ──────────────────────────────── */
export async function sendReportWebhook(webhookUrl, reportData) {
  if (!webhookUrl) return;
  const templates = loadTemplates();
  if (!templates.report) return;

  const lines = [
    `📄 **Report Filed**`,
    '',
    `**Type:** ${String(reportData.type || 'Report').toUpperCase()}`,
    `**Officer:** ${reportData.officerName || 'Unknown'}`,
  ];

  if (reportData.subjectName) {
    lines.push(`**Subject:** ${reportData.subjectName}`);
  }
  if (reportData.subjectPlate) {
    lines.push(`**Plate:** ${reportData.subjectPlate}`);
  }
  if (reportData.reportId) {
    lines.push(`**Report #:** ${reportData.reportId}`);
  }

  const ts = new Date();
  lines.push(`\n┈ ${ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);

  const ctx = {
    description: lines.join('\n'),
    color: '0xf39c12',
  };

  const payload = resolveNode(deepClone(templates.report), ctx);
  if (!payload) return;

  await sendWebhook(webhookUrl, payload);
}

/* ── Send a BOLO alert embed ───────────────────────────────── */
export async function sendBoloWebhook(webhookUrl, boloData) {
  if (!webhookUrl) return;
  const templates = loadTemplates();
  if (!templates.bolo) return;

  const lines = [
    `🚨 **BOLO Alert**`,
    '',
    `**Type:** ${String(boloData.type || '—')}`,
    `**Reason/Location:** ${boloData.reason || '—'}`,
  ];

  if (boloData.description) {
    lines.push(`**Description:** ${boloData.description}`);
  }
  if (boloData.officerName) {
    lines.push(`**Filed by:** ${boloData.officerName}`);
  }

  const ts = new Date();
  lines.push(`\n┈ ${ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);

  const ctx = {
    description: lines.join('\n'),
    color: '0xe74c3c',  // red
  };

  const payload = resolveNode(deepClone(templates.bolo), ctx);
  if (!payload) return;

  await sendWebhook(webhookUrl, payload);
}

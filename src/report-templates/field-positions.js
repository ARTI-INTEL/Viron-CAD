/**
 * report-templates/field-positions.js
 *
 * Maps report types → template PDFs → field placement coordinates.
 *
 * Coordinate system: PDF points from bottom-left (0,0).
 * US Letter = 612 × 792 pts.
 *
 * ── How to adjust coordinates ───────────────────────────────────
 * Open the template PDF in a viewer and note where blank spots are.
 * Measure approximate position from the LEFT edge (x) and from
 * the BOTTOM edge (y). Update the values below and restart.
 *
 * Fields available per template are listed in `details` from the
 * reports table plus built-in fields (officerName, serverName, etc.)
 * ────────────────────────────────────────────────────────────────
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, 'templates');

/**
 * @typedef {Object} FieldDef
 * @property {number} x  - X coordinate from left edge (pts)
 * @property {number} y  - Y coordinate from bottom edge (pts)
 * @property {number} [size=10] - Font size
 * @property {string} [font='Helvetica'] - PDF-Lib font name
 * @property {string} [color='#000000'] - Hex colour
 * @property {number} [maxWidth] - Max width before wrapping
 */

/**
 * @typedef {Object} TemplateDef
 * @property {string} templateFile  - Absolute path to the template PDF
 * @property {Object<string, FieldDef>} fields - Field key → placement
 * @property {string} [fallbackType] - For ambiguous types, use this field to determine template
 */

/**
 * Template definitions.
 * Adjust x/y values to match where each blank sits on YOUR template PDF.
 */
const TEMPLATE_CONFIG = {

  /* ── Death Report (F&R Medical) ─────────────────────────── */
  death: {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_Death_Report.pdf'),
    fields: {
      // Built-in fields
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      // Person info from details
      'r-fn':         { x: 72,  y: 590, size: 11 },
      'r-ln':         { x: 200, y: 590, size: 11 },
      'r-dob':        { x: 72,  y: 565, size: 11 },
      'r-age':        { x: 200, y: 565, size: 11 },
      'r-gen':        { x: 300, y: 565, size: 11 },
      // Cause / description
      'fr-death-cause': { x: 72, y: 480, size: 10, maxWidth: 468 },
    },
  },

  /* ── Medical Report (F&R) ───────────────────────────────── */
  medical: {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_Medical_Report.pdf'),
    fields: {
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      // Patient info
      'r-fn':         { x: 72,  y: 590, size: 11 },
      'r-ln':         { x: 200, y: 590, size: 11 },
      'r-dob':        { x: 72,  y: 565, size: 11 },
      'r-age':        { x: 200, y: 565, size: 11 },
      'r-gen':        { x: 300, y: 565, size: 11 },
      'r-occ':        { x: 400, y: 565, size: 11 },
      // Medical procedures
      'fr-medical-actions': { x: 72, y: 480, size: 10, maxWidth: 468 },
    },
  },

  /* ── F&R Incident Report ────────────────────────────────── */
  'fire-incident': {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_Fire_Incident_Report.pdf'),
    fields: {
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      location:       { x: 72,  y: 605, size: 11 },
      // Incident details
      'fr-report-details': { x: 72, y: 520, size: 10, maxWidth: 468 },
    },
  },

  /* ── DOT Incident Report ────────────────────────────────── */
  'dot-incident': {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_DOT_Incident_Report.pdf'),
    fields: {
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      location:       { x: 72,  y: 605, size: 11 },
      // Vehicle info
      'tow-brand':    { x: 72,  y: 570, size: 11 },
      'tow-plate':    { x: 200, y: 570, size: 11 },
      'tow-color':    { x: 350, y: 570, size: 11 },
      'tow-owner':    { x: 72,  y: 545, size: 11 },
      // Tow details
      'tow-reason':   { x: 72,  y: 480, size: 10, maxWidth: 468 },
    },
  },

  /* ── Law Enforcement Incident Report ────────────────────── */
  'Incident Report': {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_Law_Enforcement_Incident_Report.pdf'),
    fields: {
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      location:       { x: 72,  y: 605, size: 11 },
      // Suspect info
      'r-fn':         { x: 72,  y: 570, size: 11 },
      'r-ln':         { x: 200, y: 570, size: 11 },
      'r-dob':        { x: 72,  y: 545, size: 11 },
      'r-age':        { x: 200, y: 545, size: 11 },
      'r-gen':        { x: 300, y: 545, size: 11 },
      // Description
      'r-desc':       { x: 72,  y: 460, size: 10, maxWidth: 468 },
    },
  },

  /* ── Written Warning (LEO) ──────────────────────────────── */
  'Written Warning': {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_Written_Warning.pdf'),
    fields: {
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      // Suspect info
      'r-fn':         { x: 72,  y: 590, size: 11 },
      'r-ln':         { x: 200, y: 590, size: 11 },
      'r-dob':        { x: 72,  y: 565, size: 11 },
      'r-age':        { x: 200, y: 565, size: 11 },
      'r-gen':        { x: 300, y: 565, size: 11 },
      // Warning reason
      'r-wwreason':   { x: 72,  y: 480, size: 10, maxWidth: 468 },
    },
  },

  /* ── Citation (LEO) ─────────────────────────────────────── */
  Citation: {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_Citation_Report.pdf'),
    fields: {
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      // Suspect info
      'r-fn':         { x: 72,  y: 590, size: 11 },
      'r-ln':         { x: 200, y: 590, size: 11 },
      'r-dob':        { x: 72,  y: 565, size: 11 },
      'r-age':        { x: 200, y: 565, size: 11 },
      'r-gen':        { x: 300, y: 565, size: 11 },
      // Vehicle info
      'r-vbrand':     { x: 72,  y: 530, size: 11 },
      'r-vcolor':     { x: 200, y: 530, size: 11 },
      'r-vplate':     { x: 350, y: 530, size: 11 },
      'r-vowner':     { x: 72,  y: 505, size: 11 },
      // Charges & description
      'r-charges':    { x: 72,  y: 460, size: 10, maxWidth: 468 },
      'r-desc':       { x: 72,  y: 400, size: 10, maxWidth: 468 },
    },
  },

  /* ── Arrest (LEO) ───────────────────────────────────────── */
  Arrest: {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_Arrest_Report.pdf'),
    fields: {
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      // Suspect info
      'r-fn':         { x: 72,  y: 590, size: 11 },
      'r-ln':         { x: 200, y: 590, size: 11 },
      'r-dob':        { x: 72,  y: 565, size: 11 },
      'r-age':        { x: 200, y: 565, size: 11 },
      'r-gen':        { x: 300, y: 565, size: 11 },
      // Vehicle info
      'r-vbrand':     { x: 72,  y: 530, size: 11 },
      'r-vcolor':     { x: 200, y: 530, size: 11 },
      'r-vplate':     { x: 350, y: 530, size: 11 },
      'r-vowner':     { x: 72,  y: 505, size: 11 },
      'r-impound':    { x: 350, y: 505, size: 11 },
      // Location
      'r-cloc':       { x: 72,  y: 475, size: 11 },
      // Charges & description
      'r-charges':    { x: 72,  y: 440, size: 10, maxWidth: 468 },
      'r-desc':       { x: 72,  y: 380, size: 10, maxWidth: 468 },
    },
  },

  /* ── Warrant (LEO) ──────────────────────────────────────── */
  Warrant: {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_Warrant_Report.pdf'),
    fields: {
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      // Suspect info
      'r-fn':         { x: 72,  y: 590, size: 11 },
      'r-ln':         { x: 200, y: 590, size: 11 },
      'r-dob':        { x: 72,  y: 565, size: 11 },
      'r-age':        { x: 200, y: 565, size: 11 },
      'r-gen':        { x: 300, y: 565, size: 11 },
      // Vehicle info
      'r-vbrand':     { x: 72,  y: 530, size: 11 },
      'r-vcolor':     { x: 200, y: 530, size: 11 },
      'r-vplate':     { x: 350, y: 530, size: 11 },
      'r-vowner':     { x: 72,  y: 505, size: 11 },
      // Warrant info
      'r-wcharges':   { x: 72,  y: 460, size: 10, maxWidth: 468 },
      'r-wtype':      { x: 72,  y: 430, size: 11 },
      'r-waddr':      { x: 250, y: 430, size: 11 },
      'r-desc':       { x: 72,  y: 380, size: 10, maxWidth: 468 },
    },
  },

  /* ── Tow Report (DOT) ────────────────────────────────────── */
  tow: {
    templateFile: path.join(TEMPLATES_DIR, 'Ultimate_CAD_Tow_Report.pdf'),
    fields: {
      serverName:     { x: 306, y: 735, size: 14, font: 'Helvetica-Bold' },
      officerName:    { x: 72,  y: 680, size: 11 },
      subjectName:    { x: 72,  y: 655, size: 11 },
      callId:         { x: 72,  y: 630, size: 11 },
      reportDate:     { x: 400, y: 680, size: 11 },
      location:       { x: 72,  y: 605, size: 11 },
      // Vehicle info
      'tow-brand':    { x: 72,  y: 570, size: 11 },
      'tow-plate':    { x: 200, y: 570, size: 11 },
      'tow-color':    { x: 350, y: 570, size: 11 },
      'tow-vin':      { x: 72,  y: 545, size: 11 },
      'tow-reg':      { x: 200, y: 545, size: 11 },
      'tow-owner':    { x: 350, y: 545, size: 11 },
      'tow-ins':      { x: 72,  y: 520, size: 11 },
      'tow-insexp':   { x: 250, y: 520, size: 11 },
      // Tow details
      'tow-reason':   { x: 72,  y: 460, size: 10, maxWidth: 468 },
    },
  }

};

/**
 * Resolve the template config key for a given report type.
 *
 * Some types like "incident" are used by both F&R and DOT.
 * Here we check the officer's department to disambiguate.
 *
 * @param {string} type       - Report type from DB
 * @param {object} extra      - Extra context (officerDeptType)
 * @returns {string} The config key to look up in TEMPLATE_CONFIG
 */
export function resolveTemplateKey(type, extra = {}) {
  // Direct match
  if (TEMPLATE_CONFIG[type]) return type;

  // "incident" is ambiguous — use the dept type from the unit
  if (type === 'incident' || type === 'Incident') {
    const dept = (extra.officerDeptType || '').toUpperCase();
    if (dept === 'FR')  return 'fire-incident';
    if (dept === 'DOT') return 'dot-incident';
    // Default to Law Enforcement if unknown
    return 'Incident Report';
  }

  // Normalise casing
  const lower = type.toLowerCase();
  if (TEMPLATE_CONFIG[lower]) return lower;

  // No template found
  return null;
}

export default TEMPLATE_CONFIG;

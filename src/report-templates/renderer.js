/**
 * report-templates/renderer.js
 *
 * Uses pdf-lib to load a template PDF, embed a standard font, and
 * draw report data fields at the configured coordinates.
 *
 * Returns the filled PDF as a Buffer.
 */

import fs from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import TEMPLATE_CONFIG, { resolveTemplateKey } from './field-positions.js';

/**
 * Build a flat field-value map from the report and its details.
 *
 * This gives us a single object where keys match the `fields` keys
 * in the template config.
 *
 * @param {object} report      - Normalized report row
 * @param {string} officerName
 * @param {string} serverName
 * @returns {object} fieldKey → string value
 */
function buildFieldValues(report, officerName, serverName) {
  const details = report.details || {};

  const values = {
    // Built-in fields
    officerName,
    serverName,
    subjectName: report.subject_name || '',
    callId:       report.call_id ? String(report.call_id) : '',
    reportDate:   report.created_at ? new Date(report.created_at).toLocaleDateString() : '',
    location:     details['r-cloc'] || details['fr-rc-loc'] || details['dot-rc-loc'] || '',
    plate:        report.subject_plate || details['r-vplate'] || details['tow-plate'] || '',
  };

  // Copy every key from the details object so templates can reference
  // field IDs like r-fn, r-ln, r-desc, fr-death-cause, tow-reason, etc.
  Object.keys(details).forEach((key) => {
    const val = details[key];
    if (val !== null && val !== undefined && val !== '') {
      values[key] = String(val);
    }
  });

  return values;
}

/**
 * Parse a hex colour string (#ff8800) into an {r, g, b} object
 * with values 0-1 for pdf-lib.
 */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

/**
 * Render a report onto a template PDF.
 *
 * @param {object}   report         - Normalized report row (details is object)
 * @param {string}   officerName
 * @param {string}   serverName
 * @param {object}   [extra]        - Extra context for template resolution
 * @param {string}   [extra.officerDeptType] - 'LEO' | 'FR' | 'DOT'
 * @returns {Promise<Buffer>} The filled PDF bytes
 */
export async function renderReportToTemplate(report, officerName, serverName, extra = {}) {
  const type = report.type || '';
  const configKey = resolveTemplateKey(type, extra);

  // No template found — return null so caller can use the fallback
  if (!configKey || !TEMPLATE_CONFIG[configKey]) {
    return null;
  }

  const config = TEMPLATE_CONFIG[configKey];

  // 1. Load the template PDF
  const templateBytes = await fs.readFile(config.templateFile);
  const pdfDoc = await PDFDocument.load(templateBytes);

  // 2. Embed the standard Helvetica font (always available)
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 3. Build the field-value map
  const fieldValues = buildFieldValues(report, officerName, serverName);

  // 4. Get the first page (templates are single-page for now)
  const pages = pdfDoc.getPages();
  if (pages.length === 0) return null;
  const page = pages[0];
  const { width, height } = page.getSize();

  // 5. Draw each configured field
  const fieldDefs = config.fields || {};

  for (const [fieldKey, def] of Object.entries(fieldDefs)) {
    const value = fieldValues[fieldKey];
    if (!value) continue; // skip empty fields

    const font = def.font === 'Helvetica-Bold' ? helveticaBold : helveticaFont;
    const fontSize = def.size || 10;
    const color = def.color || '#000000';
    const { r, g, b } = hexToRgb(color);

    // Clamp y to page bounds
    const yPos = Math.min(def.y, height - fontSize);

    // Draw text
    if (def.maxWidth) {
      // Word-wrap within maxWidth
      const words = value.split(' ');
      let line = '';
      let lineY = yPos;

      for (const word of words) {
        const testLine = line ? line + ' ' + word : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth > def.maxWidth && line) {
          page.drawText(line, {
            x: def.x,
            y: lineY,
            size: fontSize,
            font,
            color: rgb(r, g, b),
          });
          lineY -= fontSize * 1.4;
          line = word;
        } else {
          line = testLine;
        }
      }

      if (line) {
        page.drawText(line, {
          x: def.x,
          y: lineY,
          size: fontSize,
          font,
          color: rgb(r, g, b),
        });
      }
    } else {
      // Single-line text
      page.drawText(value, {
        x: def.x,
        y: yPos,
        size: fontSize,
        font,
        color: rgb(r, g, b),
      });
    }
  }

  // 6. Return the bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}


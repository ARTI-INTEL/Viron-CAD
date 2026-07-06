/**
 * report-templates/index.js
 *
 * Main entry point for report PDF generation.
 * Uses the user's template PDFs when available, falls back to
 * generic pdfkit generation for types without a template.
 */

export { renderReportToTemplate } from './renderer.js';
export { resolveTemplateKey, default as TEMPLATE_CONFIG } from './field-positions.js';

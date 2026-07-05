import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember, verifyUnit } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';
import PDFDocument from 'pdfkit';
import { logReportActivity } from './dept-activity.routes.js';
import { logAuditEvent } from './audit.routes.js';

const router = Router();

function normalizeReport(row) {
  if (!row) return row;
  if (typeof row.details === 'string') {
    try {
      row.details = JSON.parse(row.details);
    } catch (_) {
      row.details = {};
    }
  } else if (!row.details || typeof row.details !== 'object') {
    row.details = {};
  }
  return row;
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pickFirstString(values) {
  for (const value of values) {
    const trimmed = asTrimmedString(value);
    if (trimmed) return trimmed;
  }
  return null;
}

function buildSubjectName(details) {
  if (!details || typeof details !== 'object') return null;

  const firstName = pickFirstString([
    details['r-fn'],
    details.firstName,
    details.subjectFirstName,
  ]);
  const lastName = pickFirstString([
    details['r-ln'],
    details.lastName,
    details.subjectLastName,
  ]);

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;

  return pickFirstString([
    details.subjectName,
    details.patientName,
    details.ownerName,
  ]);
}

function buildSubjectPlate(details) {
  if (!details || typeof details !== 'object') return null;
  return pickFirstString([
    details['r-vplate'],
    details['tow-plate'],
    details.subjectPlate,
    details.plate,
  ]);
}

function buildReportSummary(row) {
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  return {
    id: row.id,
    type: row.type,
    subjectName: row.subject_name,
    subjectPlate: row.subject_plate,
    createdAt: row.created_at,
    callId: row.call_id,
    summary: pickFirstString([
      details['r-desc'],
      details['fr-report-details'],
      details['dot-report-details'],
      details['r-wwreason'],
      details['r-charges'],
      details['r-wcharges'],
      details['tow-reason'],
      details['fr-medical-actions'],
      details['fr-death-cause'],
    ]) || '',
  };
}

// GET /reports/:serverId/character?firstName=&lastName= all reports for a named character
router.get('/:serverId/character', verifyUser, verifyMember, async (req, res) => {
  const firstName = asTrimmedString(req.query.firstName);
  const lastName = asTrimmedString(req.query.lastName);

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'firstName and lastName are required' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM reports
       WHERE server_id = ?
         AND LOWER(TRIM(subject_name)) = LOWER(TRIM(CONCAT(?, ' ', ?)))
       ORDER BY created_at DESC`,
      [req.params.serverId, firstName, lastName]
    );

    res.json(rows.map(function (row) { return buildReportSummary(normalizeReport(row)); }));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /reports/:serverId  all reports (any member can view)
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM reports WHERE server_id = ? ORDER BY created_at DESC',
      [req.params.serverId]
    );
    res.json(rows.map(normalizeReport));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Helper: format label key for PDF display ──────────────────
function formatLabel(key) {
  return key
    .replace(/^r-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Helper: fetch and authorize a report for a user (supervisor+ only) ──
async function getReportForUser(reportId, userId) {
  const [rows] = await pool.query('SELECT * FROM reports WHERE id = ?', [reportId]);
  if (!rows.length) return null;

  const report = normalizeReport(rows[0]);

  // Only server owner or supervisor can download PDFs
  const [serverRows] = await pool.query('SELECT owner_id FROM servers WHERE idserver = ?', [report.server_id]);
  if (!serverRows.length) return null;
  if (String(serverRows[0].owner_id) === String(userId)) return report;

  // Check if user has SUPERVISOR perms on any dept in this server
  const [deptRows] = await pool.query(
    'SELECT id FROM departments WHERE server_id = ?',
    [report.server_id]
  );
  for (const dept of deptRows) {
    const [memberRows] = await pool.query(
      `SELECT dr.permissions
       FROM dept_members dm
       LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
       WHERE dm.dept_id = ? AND dm.user_id = ?`,
      [dept.id, userId]
    );
    if (memberRows.length) {
      const perms = memberRows[0].permissions;
      const permArr = Array.isArray(perms) ? perms :
        (typeof perms === 'string' ? (() => { try { return JSON.parse(perms); } catch (_) { return []; } })() : []);
      if (permArr.includes('SUPERVISOR') || permArr.includes('HR_ACCESS'))
        return report;
    }
  }

  return null;
}

// GET /reports/:id/pdf  download a report as PDF
router.get('/:id/pdf', verifyUser, async (req, res) => {
  try {
    const report = await getReportForUser(req.params.id, req.user.iduser);
    if (!report) return res.status(404).json({ error: 'Report not found or access denied' });

    const [officerRows] = await pool.query('SELECT username FROM users WHERE iduser = ?', [report.officer_id]);
    const officerName = officerRows[0]?.username || 'Unknown';

    const [serverRows] = await pool.query('SELECT name FROM servers WHERE idserver = ?', [report.server_id]);
    const serverName = serverRows[0]?.name || 'Ultimate CAD';

    const filename = `report-${report.id}-${String(report.type || 'report').replace(/[^a-z0-9]/gi, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // ── Header ──────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').text(serverName, { align: 'center' });
    doc.fontSize(13).font('Helvetica').fillColor('#444').text(String(report.type).toUpperCase() + ' REPORT', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#888').text(`Report #${report.id}`, { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(1);

    // ── Meta block ──────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').text('Officer: ', { continued: true }).font('Helvetica').text(officerName);
    doc.font('Helvetica-Bold').text('Subject: ', { continued: true }).font('Helvetica').text(report.subject_name || 'N/A');
    if (report.subject_plate) {
      doc.font('Helvetica-Bold').text('Plate: ', { continued: true }).font('Helvetica').text(report.subject_plate);
    }
    doc.font('Helvetica-Bold').text('Call ID: ', { continued: true }).font('Helvetica').text(report.call_id ? String(report.call_id) : 'N/A');
    doc.font('Helvetica-Bold').text('Filed: ', { continued: true }).font('Helvetica').text(new Date(report.created_at).toLocaleString());
    if (report.updated_at) {
      doc.font('Helvetica-Bold').text('Last Updated: ', { continued: true }).font('Helvetica').text(new Date(report.updated_at).toLocaleString());
    }
    doc.moveDown(1);

    // ── Details ─────────────────────────────────────────────
    doc.fontSize(13).font('Helvetica-Bold').text('Details');
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.6);

    const details = report.details || {};
    const keys = Object.keys(details).filter((k) => details[k] !== '' && details[k] != null);

    if (!keys.length) {
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('#888').text('No additional details recorded.');
    } else {
      keys.forEach((key) => {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#555').text(formatLabel(key).toUpperCase());
        doc.fontSize(11).font('Helvetica').fillColor('#000').text(String(details[key]), { paragraphGap: 6 });
        doc.moveDown(0.4);
      });
    }

    // ── Footer ──────────────────────────────────────────────
    doc.fontSize(8).fillColor('#999').text(
      `Generated by Ultimate CAD on ${new Date().toLocaleString()}`,
      50,
      780,
      { align: 'center', width: 495 }
    );

    doc.end();
  } catch (err) {
    logError(err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// POST /reports  submit a report (must be clocked in)
router.post('/', verifyUser, verifyUnit, async (req, res) => {
  const { serverId, callId, type, details } = req.body;
  if (!serverId || !type || !details || typeof details !== 'object')
    return res.status(400).json({ error: 'serverId, type, and details are required' });

  try {
    const subjectName = pickFirstString([req.body.subjectName, buildSubjectName(details)]);
    const subjectPlate = pickFirstString([req.body.subjectPlate, buildSubjectPlate(details)]);
    const [result] = await pool.query(
      `INSERT INTO reports (server_id, officer_id, call_id, type, subject_name, subject_plate, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [serverId, req.unit.id, callId || null, type, subjectName || null, subjectPlate || null, JSON.stringify(details)]
    );
    // Log report activity for department members
    logReportActivity(req.user.iduser, serverId).catch(function () {});

    res.json({ success: true, reportId: result.insertId });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── Permission helper ──────────────────────────────────────── */
async function canModifyReport(reportId, userId) {
  const [rows] = await pool.query(
    'SELECT r.*, s.owner_id FROM reports r JOIN servers s ON s.idserver = r.server_id WHERE r.id = ?',
    [reportId]
  );
  if (!rows.length) return { allowed: false, report: null };
  const report = rows[0];

  // Original officer can edit their own reports
  if (String(report.officer_id) === String(userId)) return { allowed: true, report };

  // Server owner can edit any report on their server
  if (String(report.owner_id) === String(userId)) return { allowed: true, report };

  // Check if user has SUPERVISOR perms on any dept in this server
  const [deptRows] = await pool.query(
    'SELECT id FROM departments WHERE server_id = ?',
    [report.server_id]
  );
  for (const dept of deptRows) {
    const [memberRows] = await pool.query(
      `SELECT dr.permissions
       FROM dept_members dm
       LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
       WHERE dm.dept_id = ? AND dm.user_id = ?`,
      [dept.id, userId]
    );
    if (memberRows.length) {
      const perms = memberRows[0].permissions;
      const permArr = Array.isArray(perms) ? perms :
        (typeof perms === 'string' ? (() => { try { return JSON.parse(perms); } catch (_) { return []; } })() : []);
      if (permArr.includes('SUPERVISOR') || permArr.includes('HR_ACCESS'))
        return { allowed: true, report };
    }
  }

  return { allowed: false, report };
}

// PATCH /reports/:id  update a report (owner/supervisor/officer)
router.patch('/:id', verifyUser, async (req, res) => {
  const { type, subjectName, subjectPlate, details } = req.body;

  try {
    const { allowed, report } = await canModifyReport(req.params.id, req.user.iduser);
    if (!allowed || !report)
      return res.status(403).json({ error: 'Forbidden: you cannot edit this report' });

    await pool.query(
      `UPDATE reports SET
         type = COALESCE(?, type),
         subject_name = COALESCE(?, subject_name),
         subject_plate = COALESCE(?, subject_plate),
         details = COALESCE(?, details),
         updated_at = NOW()
       WHERE id = ?`,
      [
        type || null,
        subjectName || null,
        subjectPlate || null,
        details ? JSON.stringify(details) : null,
        req.params.id
      ]
    );

    // Log audit event
    logAuditEvent(report.server_id, req.user.iduser, 'REPORT_EDITED', 'report', Number(req.params.id), {
      type: type || report.type,
      reportId: Number(req.params.id),
    }).catch(function () {});

    const [rows] = await pool.query('SELECT * FROM reports WHERE id = ?', [req.params.id]);
    res.json(normalizeReport(rows[0]));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /reports/:id  delete a report (owner/supervisor only)
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const { allowed, report } = await canModifyReport(req.params.id, req.user.iduser);
    if (!allowed || !report)
      return res.status(403).json({ error: 'Forbidden: you cannot delete this report' });

    // Only server owner or supervisor can delete (not the reporting officer)
    const isOwner = String(report.owner_id) === String(req.user.iduser);
    const isOfficer = String(report.officer_id) === String(req.user.iduser);
    if (isOfficer && !isOwner) {
      // Check if officer has supervisor perms
      const [deptRows] = await pool.query(
        'SELECT id FROM departments WHERE server_id = ?',
        [report.server_id]
      );
      let hasSupervisorPerms = false;
      for (const dept of deptRows) {
        const [memberRows] = await pool.query(
          `SELECT dr.permissions
           FROM dept_members dm
           LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
           WHERE dm.dept_id = ? AND dm.user_id = ?`,
          [dept.id, req.user.iduser]
        );
        if (memberRows.length) {
          const perms = memberRows[0].permissions;
          const permArr = Array.isArray(perms) ? perms :
            (typeof perms === 'string' ? (() => { try { return JSON.parse(perms); } catch (_) { return []; } })() : []);
          if (permArr.includes('SUPERVISOR') || permArr.includes('HR_ACCESS')) {
            hasSupervisorPerms = true;
            break;
          }
        }
      }
      if (!hasSupervisorPerms)
        return res.status(403).json({ error: 'Forbidden: only supervisors or the server owner can delete reports' });
    }

    await pool.query('DELETE FROM reports WHERE id = ?', [req.params.id]);

    logAuditEvent(report.server_id, req.user.iduser, 'REPORT_DELETED', 'report', Number(req.params.id), {
      type: report.type,
    }).catch(function () {});

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

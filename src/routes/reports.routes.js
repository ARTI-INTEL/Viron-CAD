import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember, verifyUnit } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';
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

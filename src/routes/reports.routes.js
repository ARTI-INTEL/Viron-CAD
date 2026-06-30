import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember, verifyUnit } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

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
    res.json({ success: true, reportId: result.insertId });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

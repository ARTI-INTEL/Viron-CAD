import { Router } from 'express';
import pool from '../db.js';
import { verifyUser } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';
import { sendClockInWebhook } from '../utility/webhook.js';

const router = Router();

/* ── Exported helpers (used by units & reports routes) ───── */
export async function logClockInActivity(userId, serverId, deptName) {
  try {
    const [deptRows] = await pool.query(
      'SELECT id, clock_in_webhook_url FROM departments WHERE server_id = ? AND name = ?',
      [serverId, deptName]
    );
    if (!deptRows.length) return;

    const deptId = deptRows[0].id;
    const clockInWebhook = deptRows[0].clock_in_webhook_url;

    const [memberRows] = await pool.query(
      'SELECT id FROM dept_members WHERE dept_id = ? AND user_id = ?',
      [deptId, userId]
    );
    if (!memberRows.length) return;

    await pool.query(
      'INSERT INTO dept_activity_log (dept_id, member_id, user_id, action_type) VALUES (?, ?, ?, ?)',
      [deptId, memberRows[0].id, userId, 'CLOCK_IN']
    );

    // ── Fire clock-in webhook if department has one configured ──
    if (clockInWebhook) {
      try {
        const [userRows] = await pool.query(
          'SELECT username FROM users WHERE iduser = ?',
          [userId]
        );
        // Get the unit info to include callsign, department, etc.
        const [unitRows] = await pool.query(
          `SELECT name, callsign, department FROM units
           WHERE user_id = ? AND server_id = ?
           ORDER BY id DESC LIMIT 1`,
          [userId, serverId]
        );
        const unit = unitRows.length ? unitRows[0] : { name: deptName, callsign: '', department: deptName };
        sendClockInWebhook(clockInWebhook, {
          name: unit.name || (userRows.length ? userRows[0].username : 'Unknown'),
          callsign: unit.callsign || '—',
          department: unit.department || deptName,
        }).catch(function () {});
      } catch (_) {
        // silent
      }
    }
  } catch (_) {
    // silent – logging should never break the main flow
  }
}

export async function logReportActivity(userId, serverId) {
  try {
    const [deptRows] = await pool.query(
      `SELECT dm.id AS member_id, d.id AS dept_id
       FROM dept_members dm
       JOIN departments d ON d.id = dm.dept_id
       WHERE dm.user_id = ? AND d.server_id = ?`,
      [userId, serverId]
    );
    for (const row of deptRows) {
      await pool.query(
        'INSERT INTO dept_activity_log (dept_id, member_id, user_id, action_type) VALUES (?, ?, ?, ?)',
        [row.dept_id, row.member_id, userId, 'REPORT']
      );
    }
  } catch (_) {
    // silent
  }
}

/* ── Permission helpers ────────────────────────────────────── */

async function isServerOwnerOrDeptHR(deptId, userId) {
  const [deptRows] = await pool.query('SELECT server_id FROM departments WHERE id = ?', [deptId]);
  if (!deptRows.length) return false;
  const [servers] = await pool.query('SELECT owner_id FROM servers WHERE idserver = ?', [deptRows[0].server_id]);
  if (servers.length && String(servers[0].owner_id) === String(userId)) return true;

  const [members] = await pool.query(
    `SELECT dr.permissions
     FROM dept_members dm
     LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
     WHERE dm.dept_id = ? AND dm.user_id = ?`,
    [deptId, userId]
  );
  if (!members.length) return false;
  const perms = members[0].permissions;
  if (Array.isArray(perms)) return perms.includes('HR_ACCESS');
  if (typeof perms === 'string') {
    try { return JSON.parse(perms).includes('HR_ACCESS'); } catch (_) { return false; }
  }
  return false;
}

/* ── GET /dept-activity/:deptId/min-activity  get min weekly activity ── */
router.get('/:deptId/min-activity', verifyUser, async (req, res) => {
  const { deptId } = req.params;
  try {
    const [rows] = await pool.query('SELECT min_weekly_activity FROM departments WHERE id = ?', [deptId]);
    if (!rows.length) return res.status(404).json({ error: 'Department not found' });
    res.json({ min_weekly_activity: rows[0].min_weekly_activity || 0 });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /dept-activity/:deptId/weekly  weekly activity counts ── */
router.get('/:deptId/weekly', verifyUser, async (req, res) => {
  const { deptId } = req.params;
  try {
    if (!(await isServerOwnerOrDeptHR(deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const [rows] = await pool.query(
      `SELECT dal.user_id, COUNT(*) AS activity_count
       FROM dept_activity_log dal
       WHERE dal.dept_id = ?
         AND dal.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY dal.user_id`,
      [deptId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── PATCH /dept-activity/:deptId/min-activity  set min weekly ── */
router.patch('/:deptId/min-activity', verifyUser, async (req, res) => {
  const { deptId } = req.params;
  const { minWeeklyActivity } = req.body;
  if (minWeeklyActivity == null || typeof minWeeklyActivity !== 'number' || minWeeklyActivity < 0)
    return res.status(400).json({ error: 'minWeeklyActivity must be a non-negative number' });

  try {
    // Only server owner or HR+ can set this
    if (!(await isServerOwnerOrDeptHR(deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query('UPDATE departments SET min_weekly_activity = ? WHERE id = ?', [minWeeklyActivity, deptId]);
    res.json({ success: true, min_weekly_activity: minWeeklyActivity });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

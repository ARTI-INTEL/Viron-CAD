import { Router } from 'express';
import pool from '../db.js';
import { verifyUser } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

// ── Permission check: user must be HR+ or server owner ─────
async function canManageDept(deptId, userId) {
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

// ── Permission check: user must be HR+ OR supervisor ──────
async function canViewMemberDetails(deptId, userId) {
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
  let permArr = [];
  if (Array.isArray(perms)) permArr = perms;
  else if (typeof perms === 'string') {
    try { permArr = JSON.parse(perms); if (!Array.isArray(permArr)) permArr = []; } catch (_) { permArr = []; }
  }
  return permArr.includes('HR_ACCESS') || permArr.includes('SUPERVISOR');
}

// GET /dept-infractions/:deptId/member/:memberId  list infractions for a member
// Accessible to HR+ and supervisors
router.get('/:deptId/member/:memberId', verifyUser, async (req, res) => {
  try {
    if (!(await canViewMemberDetails(req.params.deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const [rows] = await pool.query(
      `SELECT di.*, u.username AS given_by_name
       FROM dept_infractions di
       LEFT JOIN users u ON u.iduser = di.given_by_user_id
       WHERE di.dept_id = ? AND di.member_id = ?
       ORDER BY di.created_at DESC`,
      [req.params.deptId, req.params.memberId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /dept-infractions  give an infraction (HR+ or server owner)
router.post('/', verifyUser, async (req, res) => {
  const { deptId, memberId, reason } = req.body;
  if (!deptId || !memberId || !reason)
    return res.status(400).json({ error: 'deptId, memberId, and reason are required' });

  try {
    if (!(await canManageDept(deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const [result] = await pool.query(
      'INSERT INTO dept_infractions (dept_id, member_id, given_by_user_id, reason) VALUES (?, ?, ?, ?)',
      [deptId, memberId, req.user.iduser, reason.trim()]
    );
    const [rows] = await pool.query(
      `SELECT di.*, u.username AS given_by_name
       FROM dept_infractions di
       LEFT JOIN users u ON u.iduser = di.given_by_user_id
       WHERE di.id = ?`,
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /dept-infractions/:id  remove an infraction (HR+ or server owner)
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const [infRows] = await pool.query(
      'SELECT di.*, d.server_id FROM dept_infractions di JOIN departments d ON d.id = di.dept_id WHERE di.id = ?',
      [req.params.id]
    );
    if (!infRows.length) return res.status(404).json({ error: 'Infraction not found' });

    if (!(await canManageDept(infRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM dept_infractions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

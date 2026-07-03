import { Router } from 'express';
import pool from '../db.js';
import { verifyUser } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

const VALID_PERMS = ['HR_ACCESS', 'SUPERVISOR', 'MANAGE_ROLES'];

// ── Owner / HR check (same pattern as dept-members) ──────────

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

// ── Ranks ─────────────────────────────────────────────────────

// GET /dept-ranks/:deptId  list ranks for a department
router.get('/:deptId', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM dept_ranks WHERE dept_id = ? ORDER BY created_at ASC',
      [req.params.deptId]
    );
    rows.forEach(function (r) {
      if (typeof r.permissions === 'string') {
        try { r.permissions = JSON.parse(r.permissions); } catch (_) { r.permissions = []; }
      }
    });
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /dept-ranks  create a rank (HR+ or owner)
router.post('/', verifyUser, async (req, res) => {
  const { deptId, name, permissions } = req.body;
  if (!deptId || !name)
    return res.status(400).json({ error: 'deptId and name are required' });

  try {
    if (!(await isServerOwnerOrDeptHR(deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const perms = Array.isArray(permissions)
      ? permissions.filter(function (p) { return VALID_PERMS.includes(p); })
      : [];

    const [result] = await pool.query(
      'INSERT INTO dept_ranks (dept_id, name, permissions) VALUES (?, ?, ?)',
      [deptId, name.trim(), JSON.stringify(perms)]
    );
    const [rows] = await pool.query('SELECT * FROM dept_ranks WHERE id = ?', [result.insertId]);
    if (typeof rows[0].permissions === 'string') {
      try { rows[0].permissions = JSON.parse(rows[0].permissions); } catch (_) { rows[0].permissions = []; }
    }
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /dept-ranks/:id  update rank (HR+ or owner)
router.patch('/:id', verifyUser, async (req, res) => {
  const { name, permissions } = req.body;

  try {
    const [rankRows] = await pool.query(
      'SELECT dr.*, d.server_id FROM dept_ranks dr JOIN departments d ON d.id = dr.dept_id WHERE dr.id = ?',
      [req.params.id]
    );
    if (!rankRows.length) return res.status(404).json({ error: 'Rank not found' });

    if (!(await isServerOwnerOrDeptHR(rankRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    if (name !== undefined) {
      await pool.query('UPDATE dept_ranks SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
    }
    if (permissions !== undefined) {
      const perms = Array.isArray(permissions)
        ? permissions.filter(function (p) { return VALID_PERMS.includes(p); })
        : [];
      await pool.query('UPDATE dept_ranks SET permissions = ? WHERE id = ?', [JSON.stringify(perms), req.params.id]);
    }

    const [rows] = await pool.query('SELECT * FROM dept_ranks WHERE id = ?', [req.params.id]);
    if (typeof rows[0].permissions === 'string') {
      try { rows[0].permissions = JSON.parse(rows[0].permissions); } catch (_) { rows[0].permissions = []; }
    }
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /dept-ranks/:id  (HR+ or owner)
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const [rankRows] = await pool.query(
      'SELECT dr.*, d.server_id FROM dept_ranks dr JOIN departments d ON d.id = dr.dept_id WHERE dr.id = ?',
      [req.params.id]
    );
    if (!rankRows.length) return res.status(404).json({ error: 'Rank not found' });

    if (!(await isServerOwnerOrDeptHR(rankRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    // Set members with this rank to null
    await pool.query('UPDATE dept_members SET rank_id = NULL WHERE rank_id = ?', [req.params.id]);
    await pool.query('DELETE FROM dept_ranks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Additional Roles (certs / custom roles) ───────────────────

// GET /dept-ranks/:deptId/roles  list additional roles for a department
router.get('/:deptId/roles', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM dept_roles WHERE dept_id = ? ORDER BY name ASC',
      [req.params.deptId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /dept-ranks/:deptId/roles  create additional role (HR+ or owner)
router.post('/:deptId/roles', verifyUser, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    if (!(await isServerOwnerOrDeptHR(req.params.deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const [result] = await pool.query(
      'INSERT INTO dept_roles (dept_id, name) VALUES (?, ?)',
      [req.params.deptId, name.trim()]
    );
    const [rows] = await pool.query('SELECT * FROM dept_roles WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /dept-ranks/roles/:roleId  rename additional role
router.patch('/roles/:roleId', verifyUser, async (req, res) => {
  const { name } = req.body;

  try {
    const [roleRows] = await pool.query(
      'SELECT dr.*, d.server_id FROM dept_roles dr JOIN departments d ON d.id = dr.dept_id WHERE dr.id = ?',
      [req.params.roleId]
    );
    if (!roleRows.length) return res.status(404).json({ error: 'Role not found' });

    if (!(await isServerOwnerOrDeptHR(roleRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query('UPDATE dept_roles SET name = ? WHERE id = ?', [name.trim(), req.params.roleId]);
    const [rows] = await pool.query('SELECT * FROM dept_roles WHERE id = ?', [req.params.roleId]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /dept-ranks/roles/:roleId  delete additional role
router.delete('/roles/:roleId', verifyUser, async (req, res) => {
  try {
    const [roleRows] = await pool.query(
      'SELECT dr.*, d.server_id FROM dept_roles dr JOIN departments d ON d.id = dr.dept_id WHERE dr.id = ?',
      [req.params.roleId]
    );
    if (!roleRows.length) return res.status(404).json({ error: 'Role not found' });

    if (!(await isServerOwnerOrDeptHR(roleRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM dept_member_roles WHERE role_id = ?', [req.params.roleId]);
    await pool.query('DELETE FROM dept_roles WHERE id = ?', [req.params.roleId]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

const PERMISSION_FLAGS = ['HR_ACCESS', 'SUPERVISOR', 'MANAGE_ROLES'];

// ── Helpers ─────────────────────────────────────────────────────

async function getDeptOrFail(deptId) {
  const [rows] = await pool.query('SELECT * FROM departments WHERE id = ?', [deptId]);
  return rows.length ? rows[0] : null;
}

async function isServerOwnerOrDeptHR(deptId, userId) {
  const dept = await getDeptOrFail(deptId);
  if (!dept) return false;
  // Server owner always has full access
  const [servers] = await pool.query('SELECT owner_id FROM servers WHERE idserver = ?', [dept.server_id]);
  if (servers.length && String(servers[0].owner_id) === String(userId)) return true;

  // Check if user has HR_ACCESS on this department
  const [members] = await pool.query(
    `SELECT dm.id, dm.rank_id, dr.permissions
     FROM dept_members dm
     LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
     WHERE dm.dept_id = ? AND dm.user_id = ?`,
    [deptId, userId]
  );
  if (!members.length) return false;
  const perms = members[0].permissions;
  if (Array.isArray(perms) && perms.includes('HR_ACCESS')) return true;
  if (typeof perms === 'string') {
    try {
      const parsed = JSON.parse(perms);
      return Array.isArray(parsed) && parsed.includes('HR_ACCESS');
    } catch (_) { return false; }
  }
  return false;
}

async function getUserDeptPerms(deptId, userId) {
  const [members] = await pool.query(
    `SELECT dm.id AS member_id, dm.rank_id, dr.name AS rank_name, dr.permissions
     FROM dept_members dm
     LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
     WHERE dm.dept_id = ? AND dm.user_id = ?`,
    [deptId, userId]
  );
  if (!members.length) return null;
  const m = members[0];
  let perms = [];
  if (Array.isArray(m.permissions)) perms = m.permissions;
  else if (typeof m.permissions === 'string') {
    try { perms = JSON.parse(m.permissions); } catch (_) {}
  }
  return {
    memberId: m.member_id,
    rankId: m.rank_id,
    rankName: m.rank_name,
    permissions: perms,
  };
}

// ── Literal routes must come BEFORE parameterised routes ──────

// GET /dept-members/me  get all dept memberships for current user
// Includes implicit owner memberships for servers the user owns
router.get('/me', verifyUser, async (req, res) => {
  try {
    // Explicit memberships
    const [rows] = await pool.query(
      `SELECT dm.id AS member_id, dm.dept_id, dm.rank_id, dm.created_at,
              d.name AS dept_name, d.type AS dept_type,
              dr.name AS rank_name, dr.permissions
       FROM dept_members dm
       JOIN departments d ON d.id = dm.dept_id
       LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
       WHERE dm.user_id = ?
       ORDER BY d.type, d.name`,
      [req.user.iduser]
    );

    // Implicit owner memberships (depts in servers the user owns)
    const [ownedDepts] = await pool.query(
      `SELECT d.id AS dept_id, d.name AS dept_name, d.type AS dept_type
       FROM departments d
       JOIN servers s ON s.idserver = d.server_id
       WHERE s.owner_id = ?`,
      [req.user.iduser]
    );

    // Merge: explicit rows take precedence (check by dept_id)
    var explicitDeptIds = rows.map(function (r) { return r.dept_id; });
    ownedDepts.forEach(function (od) {
      if (!explicitDeptIds.includes(od.dept_id)) {
        rows.push({
          member_id: null,
          dept_id: od.dept_id,
          rank_id: null,
          created_at: null,
          dept_name: od.dept_name,
          dept_type: od.dept_type,
          rank_name: 'Owner',
          permissions: ['HR_ACCESS', 'SUPERVISOR', 'MANAGE_ROLES'],
        });
      }
    });

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

// GET /dept-members/me/:deptId  check current user's membership & perms
// Server owners implicitly get full permissions on all depts in their server
router.get('/me/:deptId', verifyUser, async (req, res) => {
  try {
    // First check explicit membership
    const perms = await getUserDeptPerms(req.params.deptId, req.user.iduser);
    if (perms) return res.json({ member: true, ...perms });

    // Check if user is server owner of this department's server
    const [deptRows] = await pool.query('SELECT server_id FROM departments WHERE id = ?', [req.params.deptId]);
    if (deptRows.length) {
      const [servers] = await pool.query('SELECT owner_id FROM servers WHERE idserver = ?', [deptRows[0].server_id]);
      if (servers.length && String(servers[0].owner_id) === String(req.user.iduser)) {
        return res.json({
          member: true,
          memberId: null,
          rankId: null,
          rankName: 'Owner',
          permissions: ['HR_ACCESS', 'SUPERVISOR', 'MANAGE_ROLES'],
        });
      }
    }

    res.json({ member: false });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /dept-members/:deptId  list members (HR+ or server owner)
router.get('/:deptId', verifyUser, async (req, res) => {
  try {
    if (!(await isServerOwnerOrDeptHR(req.params.deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const [rows] = await pool.query(
      `SELECT dm.id, dm.user_id, dm.dept_id, dm.rank_id, dm.created_at,
              u.username,
              dr.name AS rank_name, dr.permissions
       FROM dept_members dm
       JOIN users u      ON u.iduser = dm.user_id
       LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
       WHERE dm.dept_id = ?
       ORDER BY dr.name ASC, u.username ASC`,
      [req.params.deptId]
    );
    // Parse permissions JSON for each row
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

// POST /dept-members  add member (HR+ or server owner)
router.post('/', verifyUser, async (req, res) => {
  const { deptId, userId, rankId } = req.body;
  if (!deptId || !userId)
    return res.status(400).json({ error: 'deptId and userId are required' });

  try {
    if (!(await isServerOwnerOrDeptHR(deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const [result] = await pool.query(
      'INSERT IGNORE INTO dept_members (dept_id, user_id, rank_id) VALUES (?, ?, ?)',
      [deptId, userId, rankId || null]
    );
    if (result.affectedRows === 0)
      return res.status(409).json({ error: 'User is already a member of this department' });

    const [rows] = await pool.query(
      `SELECT dm.*, u.username, dr.name AS rank_name
       FROM dept_members dm
       JOIN users u ON u.iduser = dm.user_id
       LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
       WHERE dm.id = ?`,
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /dept-members/:id  change rank (HR+ or server owner)
router.patch('/:id', verifyUser, async (req, res) => {
  const { rankId } = req.body;

  try {
    const [memberRows] = await pool.query(
      'SELECT dm.*, d.server_id FROM dept_members dm JOIN departments d ON d.id = dm.dept_id WHERE dm.id = ?',
      [req.params.id]
    );
    if (!memberRows.length) return res.status(404).json({ error: 'Member not found' });

    if (!(await isServerOwnerOrDeptHR(memberRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query('UPDATE dept_members SET rank_id = ? WHERE id = ?', [rankId || null, req.params.id]);

    const [rows] = await pool.query(
      `SELECT dm.*, u.username, dr.name AS rank_name
       FROM dept_members dm
       JOIN users u ON u.iduser = dm.user_id
       LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
       WHERE dm.id = ?`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /dept-members/:id  remove member (HR+ or server owner)
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const [memberRows] = await pool.query(
      'SELECT dm.*, d.server_id FROM dept_members dm JOIN departments d ON d.id = dm.dept_id WHERE dm.id = ?',
      [req.params.id]
    );
    if (!memberRows.length) return res.status(404).json({ error: 'Member not found' });

    if (!(await isServerOwnerOrDeptHR(memberRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM dept_members WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Supervisor officer search ────────────────────────────────────

// GET /dept-members/supervisor-search/:deptId?q=username  search members by username
// Returns member details: rank, roles, infraction count
// Accessible to supervisors and HR+
router.get('/supervisor-search/:deptId', verifyUser, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1)
    return res.json([]);

  try {
    // Check the user has supervisor or HR access on this dept
    const [deptRows] = await pool.query('SELECT server_id FROM departments WHERE id = ?', [req.params.deptId]);
    if (!deptRows.length) return res.status(404).json({ error: 'Department not found' });

    const [servers] = await pool.query('SELECT owner_id FROM servers WHERE idserver = ?', [deptRows[0].server_id]);
    const isOwner = servers.length && String(servers[0].owner_id) === String(req.user.iduser);
    if (!isOwner) {
      const [memberRows] = await pool.query(
        `SELECT dr.permissions
         FROM dept_members dm
         LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
         WHERE dm.dept_id = ? AND dm.user_id = ?`,
        [req.params.deptId, req.user.iduser]
      );
      if (!memberRows.length) return res.status(403).json({ error: 'Forbidden' });
      const perms = memberRows[0].permissions;
      const permArr = Array.isArray(perms) ? perms : (typeof perms === 'string' ? (() => { try { return JSON.parse(perms); } catch (_) { return []; } })() : []);
      if (!permArr.includes('HR_ACCESS') && !permArr.includes('SUPERVISOR'))
        return res.status(403).json({ error: 'Forbidden' });
    }

    // Search members by username within this department
    const [rows] = await pool.query(
      `SELECT dm.id AS member_id, dm.user_id, u.username,
              dr.name AS rank_name, dr.permissions AS rank_permissions
       FROM dept_members dm
       JOIN users u ON u.iduser = dm.user_id
       LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
       WHERE dm.dept_id = ? AND u.username LIKE ?
       ORDER BY u.username ASC
       LIMIT 20`,
      [req.params.deptId, '%' + q + '%']
    );

    // For each result, fetch roles and infraction count
    var results = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var [roleRows] = await pool.query(
        `SELECT dr.name AS role_name
         FROM dept_member_roles dmr
         JOIN dept_roles dr ON dr.id = dmr.role_id
         WHERE dmr.member_id = ?`,
        [r.member_id]
      );
      var [infRows] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM dept_infractions WHERE member_id = ?',
        [r.member_id]
      );
      results.push({
        member_id: r.member_id,
        user_id: r.user_id,
        username: r.username,
        rank_name: r.rank_name,
        roles: roleRows.map(function (rr) { return rr.role_name; }),
        infractionCount: infRows[0].cnt,
      });
    }

    res.json(results);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Member roles (certs / additional roles) ─────────────────────

// GET /dept-members/:memberId/roles  list roles assigned to a member
router.get('/:memberId/roles', verifyUser, async (req, res) => {
  try {
    const [memberRows] = await pool.query('SELECT * FROM dept_members WHERE id = ?', [req.params.memberId]);
    if (!memberRows.length) return res.status(404).json({ error: 'Member not found' });
    if (!(await isServerOwnerOrDeptHR(memberRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const [rows] = await pool.query(
      `SELECT dmr.id AS link_id, dr.id AS role_id, dr.name AS role_name
       FROM dept_member_roles dmr
       JOIN dept_roles dr ON dr.id = dmr.role_id
       WHERE dmr.member_id = ?`,
      [req.params.memberId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /dept-members/:memberId/roles  assign a role to a member
router.post('/:memberId/roles', verifyUser, async (req, res) => {
  const { roleId } = req.body;
  if (!roleId) return res.status(400).json({ error: 'roleId is required' });

  try {
    const [memberRows] = await pool.query('SELECT * FROM dept_members WHERE id = ?', [req.params.memberId]);
    if (!memberRows.length) return res.status(404).json({ error: 'Member not found' });
    if (!(await isServerOwnerOrDeptHR(memberRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query(
      'INSERT IGNORE INTO dept_member_roles (member_id, role_id) VALUES (?, ?)',
      [req.params.memberId, roleId]
    );
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /dept-members/:memberId/roles/:linkId  remove a role from a member
router.delete('/:memberId/roles/:linkId', verifyUser, async (req, res) => {
  try {
    const [memberRows] = await pool.query('SELECT * FROM dept_members WHERE id = ?', [req.params.memberId]);
    if (!memberRows.length) return res.status(404).json({ error: 'Member not found' });
    if (!(await isServerOwnerOrDeptHR(memberRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM dept_member_roles WHERE id = ? AND member_id = ?', [req.params.linkId, req.params.memberId]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

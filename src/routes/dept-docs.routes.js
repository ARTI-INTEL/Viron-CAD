import { Router } from 'express';
import pool from '../db.js';
import { verifyUser } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

// ── Owner / HR check ─────────────────────────────────────────

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

// GET /dept-docs/:deptId  list docs (any member of the server can view)
router.get('/:deptId', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM dept_docs WHERE dept_id = ? ORDER BY created_at DESC',
      [req.params.deptId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /dept-docs  create doc (HR+ or owner)
router.post('/', verifyUser, async (req, res) => {
  const { deptId, title, url } = req.body;
  if (!deptId || !title || !url)
    return res.status(400).json({ error: 'deptId, title, and url are required' });

  try {
    if (!(await isServerOwnerOrDeptHR(deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    const [result] = await pool.query(
      'INSERT INTO dept_docs (dept_id, title, url, created_by) VALUES (?, ?, ?, ?)',
      [deptId, title.trim(), url.trim(), req.user.iduser]
    );
    const [rows] = await pool.query('SELECT * FROM dept_docs WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /dept-docs/:id  (HR+ or owner)
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const [docRows] = await pool.query(
      'SELECT dd.*, d.server_id FROM dept_docs dd JOIN departments d ON d.id = dd.dept_id WHERE dd.id = ?',
      [req.params.id]
    );
    if (!docRows.length) return res.status(404).json({ error: 'Document not found' });

    if (!(await isServerOwnerOrDeptHR(docRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM dept_docs WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

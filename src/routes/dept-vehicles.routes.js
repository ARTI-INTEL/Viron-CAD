import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

/* ── Permission helpers ───────────────────────────────────── */

async function isServerOwnerOrDeptHR(deptId, userId) {
  const [deptRows] = await pool.query('SELECT server_id FROM departments WHERE id = ?', [deptId]);
  if (!deptRows.length) return false;
  const [servers] = await pool.query('SELECT owner_id FROM servers WHERE idserver = ?', [deptRows[0].server_id]);
  if (servers.length && String(servers[0].owner_id) === String(userId)) return true;

  const [memberRows] = await pool.query(
    `SELECT dm.id
     FROM dept_members dm
     LEFT JOIN dept_ranks dr ON dr.id = dm.rank_id
     WHERE dm.dept_id = ? AND dm.user_id = ?`,
    [deptId, userId]
  );
  if (!memberRows.length) return false;
  // Check permissions
  const [rankRows] = await pool.query('SELECT permissions FROM dept_ranks WHERE id = ?', [memberRows[0].rank_id]);
  if (!rankRows.length) return false;
  const perms = rankRows[0].permissions || [];
  return perms.includes('HR_ACCESS');
}

/* ── GET /dept-vehicles/:deptId  list all vehicles for a department ── */
router.get('/:deptId', verifyUser, verifyMember, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT dv.*, u.name AS assigned_unit_name, u.callsign AS assigned_unit_callsign
       FROM dept_vehicles dv
       LEFT JOIN units u ON u.id = dv.assigned_to_unit_id
       WHERE dv.dept_id = ?
       ORDER BY dv.name`,
      [req.params.deptId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── GET /dept-vehicles/:deptId/available  list unassigned vehicles ── */
router.get('/:deptId/available', verifyUser, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, model, plate, color
       FROM dept_vehicles
       WHERE dept_id = ? AND assigned_to_unit_id IS NULL
       ORDER BY name`,
      [req.params.deptId]
    );
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── POST /dept-vehicles  create a vehicle (HR+ or owner) ── */
router.post('/', verifyUser, async (req, res) => {
  const { deptId, name, model, plate, color } = req.body;
  if (!deptId || !name)
    return res.status(400).json({ error: 'deptId and name are required' });

  try {
    if (!(await isServerOwnerOrDeptHR(deptId, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden: HR_ACCESS or server owner required' });

    const [result] = await pool.query(
      'INSERT INTO dept_vehicles (dept_id, name, model, plate, color) VALUES (?, ?, ?, ?, ?)',
      [deptId, name.trim(), model || null, plate || null, color || null]
    );
    const [rows] = await pool.query('SELECT * FROM dept_vehicles WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── PATCH /dept-vehicles/:id  update a vehicle (HR+ or owner) ── */
router.patch('/:id', verifyUser, async (req, res) => {
  const { name, model, plate, color } = req.body;

  try {
    const [vehRows] = await pool.query('SELECT * FROM dept_vehicles WHERE id = ?', [req.params.id]);
    if (!vehRows.length) return res.status(404).json({ error: 'Vehicle not found' });

    if (!(await isServerOwnerOrDeptHR(vehRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden: HR_ACCESS or server owner required' });

    await pool.query(
      'UPDATE dept_vehicles SET name = COALESCE(?, name), model = COALESCE(?, model), plate = COALESCE(?, plate), color = COALESCE(?, color) WHERE id = ?',
      [name ? name.trim() : null, model || null, plate || null, color || null, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM dept_vehicles WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/* ── DELETE /dept-vehicles/:id  delete a vehicle (HR+ or owner) ── */
router.delete('/:id', verifyUser, async (req, res) => {
  try {
    const [vehRows] = await pool.query('SELECT * FROM dept_vehicles WHERE id = ?', [req.params.id]);
    if (!vehRows.length) return res.status(404).json({ error: 'Vehicle not found' });

    if (!(await isServerOwnerOrDeptHR(vehRows[0].dept_id, req.user.iduser)))
      return res.status(403).json({ error: 'Forbidden: HR_ACCESS or server owner required' });

    await pool.query('DELETE FROM dept_vehicles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;

import { Router } from 'express';
import pool from '../db.js';
import { verifyUser, verifyMember } from '../middleware/auth.middleware.js';
import { logError } from '../utility/logger.js';

const router = Router();

// GET /search/:serverId?q=  search characters, vehicles, firearms
router.get('/:serverId', verifyUser, verifyMember, async (req, res) => {
  const { q } = req.query;
  const { serverId } = req.params;
  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

  const like = `%${q}%`;

  try {
    const [characters] = await pool.query(
      `SELECT * FROM characters
       WHERE server_id = ?
         AND (first_name LIKE ? OR last_name LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ?)`,
      [serverId, like, like, like]
    );

    const [vehicles] = await pool.query(
      `SELECT v.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM vehicles v
       LEFT JOIN characters c ON c.id = v.owner_id
       WHERE v.server_id = ? AND (v.plate LIKE ? OR v.vin LIKE ?)`,
      [serverId, like, like]
    );

    const [firearms] = await pool.query(
      `SELECT f.*, CONCAT(c.first_name, ' ', c.last_name) AS owner_name
       FROM firearms f
       LEFT JOIN characters c ON c.id = f.owner_id
       WHERE f.server_id = ? AND f.serial LIKE ?`,
      [serverId, like]
    );

    res.json({ characters, vehicles, firearms });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
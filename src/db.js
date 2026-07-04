import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

/* ── Pool-level error handler ─────────────────────────────────
   Prevents crashes from idle connection drops (e.g. MySQL server
   closing idle connections after wait_timeout).               */
pool.on('error', function (err) {
  console.error('[DB] Pool error:', err.message);
  // The pool automatically retries on connection loss for the
  // next query, but we log so operators know about it.
});

export default pool;
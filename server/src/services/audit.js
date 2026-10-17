const { pool } = require('../config/db');

async function logAction({ companyId, actorId, action, details }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (company_id, actor_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [companyId || null, actorId || null, action, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('[audit] failed to log', action, err.message);
  }
}

module.exports = { logAction };
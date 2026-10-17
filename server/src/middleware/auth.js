const { COOKIE_NAME } = require('../utils/cookies');
const { verifyToken } = require('../utils/jwt');
const { pool } = require('../config/db');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    let claims;
    try {
      claims = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { rows } = await pool.query(
      `SELECT id, company_id, full_name, email, role, must_change_password, is_active
       FROM users WHERE id = $1`,
      [claims.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Account is not available' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---- KPI summary (role-aware)
router.get('/summary', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const where = isAdmin
      ? 'company_id = $1'
      : 'user_id = $1 AND company_id = $2';
    const params = isAdmin
      ? [req.user.company_id]
      : [req.user.id, req.user.company_id];

    const kpi = await pool.query(
      `SELECT COUNT(*)::int AS total_predictions,
              COALESCE(AVG(probability), 0)::float AS avg_probability,
              COUNT(*) FILTER (WHERE is_default = true)::int AS high_risk,
              MAX(created_at) AS last_prediction_at
       FROM predictions WHERE ${where}`,
      params
    );

    const summary = {
      ...kpi.rows[0],
      scope: isAdmin ? 'company' : 'personal',
    };

    if (isAdmin) {
      const users = await pool.query(
        `SELECT COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE role = 'admin')::int AS total_admins,
                COUNT(*) FILTER (WHERE is_active = true)::int AS active_users
         FROM users WHERE company_id = $1`,
        [req.user.company_id]
      );
      summary.users = users.rows[0];
    }

    res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

// ---- Prediction activity (last 30 days)
router.get('/predictions-trend', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const sql = isAdmin
      ? `SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS count
         FROM predictions
         WHERE company_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at)`
      : `SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS count
         FROM predictions
         WHERE user_id = $1 AND company_id = $2 AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at)`;
    const params = isAdmin
      ? [req.user.company_id]
      : [req.user.id, req.user.company_id];
    const { rows } = await pool.query(sql, params);
    res.json({ ok: true, trend: rows });
  } catch (err) {
    next(err);
  }
});

// ---- Dataset insights (from the imported loans table)
router.get('/dataset-charts', async (req, res, next) => {
  try {
    const overall = await pool.query(
      `SELECT COUNT(*)::int AS total_loans,
              SUM(defaulted)::int AS total_defaults,
              ROUND(100.0 * SUM(defaulted) / NULLIF(COUNT(*), 0), 2)::float AS default_rate
       FROM loans`
    );

    const byPurpose = await pool.query(
      `SELECT loan_purpose AS label,
              COUNT(*)::int AS total,
              SUM(defaulted)::int AS defaults,
              ROUND(100.0 * SUM(defaulted) / COUNT(*), 2)::float AS rate
       FROM loans
       WHERE loan_purpose IS NOT NULL
       GROUP BY loan_purpose
       ORDER BY rate DESC`
    );

    const bySector = await pool.query(
      `SELECT employment_sector AS label,
              COUNT(*)::int AS total,
              SUM(defaulted)::int AS defaults,
              ROUND(100.0 * SUM(defaulted) / COUNT(*), 2)::float AS rate
       FROM loans
       WHERE employment_sector IS NOT NULL
       GROUP BY employment_sector
       ORDER BY rate DESC`
    );

    const byCollateral = await pool.query(
      `SELECT collateral_type AS label,
              COUNT(*)::int AS total,
              SUM(defaulted)::int AS defaults,
              ROUND(100.0 * SUM(defaulted) / COUNT(*), 2)::float AS rate
       FROM loans
       WHERE collateral_type IS NOT NULL
       GROUP BY collateral_type
       ORDER BY rate DESC`
    );

    const rateBuckets = await pool.query(
      `SELECT
         CASE
           WHEN annual_rate_pct < 20  THEN '0–20'
           WHEN annual_rate_pct < 40  THEN '20–40'
           WHEN annual_rate_pct < 60  THEN '40–60'
           WHEN annual_rate_pct < 80  THEN '60–80'
           WHEN annual_rate_pct < 100 THEN '80–100'
           WHEN annual_rate_pct < 150 THEN '100–150'
           ELSE '150+'
         END AS bucket,
         MIN(annual_rate_pct) AS min_rate,
         COUNT(*)::int AS total,
         SUM(defaulted)::int AS defaults,
         ROUND(100.0 * SUM(defaulted) / COUNT(*), 2)::float AS rate
       FROM loans
       WHERE annual_rate_pct IS NOT NULL
       GROUP BY bucket
       ORDER BY min_rate`
    );

    res.json({
      ok: true,
      overall: overall.rows[0],
      by_purpose: byPurpose.rows,
      by_sector: bySector.rows,
      by_collateral: byCollateral.rows,
      rate_buckets: rateBuckets.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
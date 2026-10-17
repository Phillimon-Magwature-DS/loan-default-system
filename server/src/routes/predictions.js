const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { predictSchema } = require('../validators/predictions');
const modelClient = require('../services/modelClient');
const { logAction } = require('../services/audit');

const router = express.Router();

function serialisePrediction(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name || null,
    input_data: row.input_data,
    probability: Number(row.probability),
    is_default: row.is_default,
    created_at: row.created_at,
  };
}

// ---- Create prediction
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = predictSchema.parse(req.body);

    let result;
    try {
      result = await modelClient.predict(data);
    } catch (err) {
      return res
        .status(err.status || 502)
        .json({ error: err.message || 'Model service error' });
    }

    const probability = Number(result.probability);
    const isDefault = probability >= 0.5;

    const { rows } = await pool.query(
      `INSERT INTO predictions (company_id, user_id, input_data, probability, is_default)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, input_data, probability, is_default, created_at`,
      [req.user.company_id, req.user.id, JSON.stringify(data), probability, isDefault]
    );

    await logAction({
      companyId: req.user.company_id,
      actorId: req.user.id,
      action: 'prediction.created',
      details: { predictionId: rows[0].id, probability, isDefault },
    });

    res.status(201).json({ ok: true, prediction: serialisePrediction(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// ---- Own history
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, input_data, probability, is_default, created_at
       FROM predictions
       WHERE user_id = $1 AND company_id = $2
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.user.id, req.user.company_id]
    );
    res.json({ ok: true, predictions: rows.map(serialisePrediction) });
  } catch (err) {
    next(err);
  }
});

// ---- Company-wide (admin only)
router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.user_id, u.full_name AS user_name, p.input_data,
              p.probability, p.is_default, p.created_at
       FROM predictions p
       JOIN users u ON u.id = p.user_id
       WHERE p.company_id = $1
       ORDER BY p.created_at DESC
       LIMIT 500`,
      [req.user.company_id]
    );
    res.json({ ok: true, predictions: rows.map(serialisePrediction) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
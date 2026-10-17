const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/audit');
const { sendInvitationEmail } = require('../services/mailer');
const { createUserSchema, updateUserSchema } = require('../validators/users');

const router = express.Router();
const DEFAULT_PASSWORD = '0000';

// All routes below require an authenticated admin
router.use(requireAuth, requireRole('admin'));

// ---- List users in my company
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, email, role, must_change_password, is_active,
              last_login_at, created_at
       FROM users
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [req.user.company_id]
    );
    res.json({ ok: true, users: rows });
  } catch (err) {
    next(err);
  }
});

// ---- Create user / admin
router.post('/', async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);

    const taken = await pool.query('SELECT 1 FROM users WHERE email = $1', [data.email]);
    if (taken.rowCount) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

    const { rows } = await pool.query(
      `INSERT INTO users (company_id, full_name, email, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, full_name, email, role, must_change_password, is_active,
                 last_login_at, created_at`,
      [req.user.company_id, data.fullName, data.email, hash, data.role]
    );

    await logAction({
      companyId: req.user.company_id,
      actorId: req.user.id,
      action: 'user.created',
      details: { targetId: rows[0].id, email: rows[0].email, role: rows[0].role },
    });

    // Send invite email (fire-and-forget)
    try {
      const cRes = await pool.query('SELECT name FROM companies WHERE id = $1', [
        req.user.company_id,
      ]);
      const companyName = cRes.rows[0]?.name || 'your company';
      sendInvitationEmail(data.email, data.fullName, companyName, DEFAULT_PASSWORD).catch(
        (err) => console.error('[invite] email failed:', err.message)
      );
    } catch (e) {
      console.error('[invite] failed to load company name:', e.message);
    }

    res.status(201).json({ ok: true, user: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---- Update role / active status
router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id.' });
    if (id === req.user.id) {
      return res
        .status(400)
        .json({ error: 'You cannot modify your own account from here.' });
    }

    const data = updateUserSchema.parse(req.body);

    const target = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2',
      [id, req.user.company_id]
    );
    if (!target.rowCount) return res.status(404).json({ error: 'User not found.' });

    const sets = [];
    const params = [];
    let p = 1;
    if (data.role !== undefined) {
      sets.push(`role = $${p++}`);
      params.push(data.role);
    }
    if (data.isActive !== undefined) {
      sets.push(`is_active = $${p++}`);
      params.push(data.isActive);
    }
    params.push(id, req.user.company_id);

    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')}
       WHERE id = $${p++} AND company_id = $${p}
       RETURNING id, full_name, email, role, must_change_password, is_active,
                 last_login_at, created_at`,
      params
    );

    await logAction({
      companyId: req.user.company_id,
      actorId: req.user.id,
      action: 'user.updated',
      details: { targetId: id, changes: data },
    });

    res.json({ ok: true, user: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---- Reset a user's password to 0000
router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id.' });
    if (id === req.user.id) {
      return res
        .status(400)
        .json({ error: 'Use the change-password page to reset your own password.' });
    }

    const target = await pool.query(
      'SELECT id, email FROM users WHERE id = $1 AND company_id = $2',
      [id, req.user.company_id]
    );
    if (!target.rowCount) return res.status(404).json({ error: 'User not found.' });

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2',
      [hash, id]
    );

    await logAction({
      companyId: req.user.company_id,
      actorId: req.user.id,
      action: 'user.password_reset_by_admin',
      details: { targetId: id, email: target.rows[0].email },
    });

    res.json({
      ok: true,
      message: 'Password reset to 0000. User must set a new password on next login.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
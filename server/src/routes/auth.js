const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { generateSixDigitCode, hashCode, verifyCode } = require('../utils/codes');
const { signToken } = require('../utils/jwt');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookies');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, codeLimiter } = require('../middleware/rateLimit');
const { sendVerificationCode } = require('../services/mailer');
const { logAction } = require('../services/audit');
const schemas = require('../validators/auth');

const router = express.Router();

const CODE_TTL_MIN = 10;
const MAX_CODE_ATTEMPTS = 5;

function userResponse(u) {
  return {
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    must_change_password: u.must_change_password,
    company_id: u.company_id,
  };
}

async function issueCode(email, purpose) {
  const code = generateSixDigitCode();
  const codeHash = await hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);

  await pool.query(
    `UPDATE verification_codes SET consumed_at = now()
     WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [email, purpose]
  );
  await pool.query(
    `INSERT INTO verification_codes (email, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [email, purpose, codeHash, expiresAt]
  );
  return code;
}

async function consumeCode(email, purpose, code) {
  const { rows } = await pool.query(
    `SELECT * FROM verification_codes
     WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [email, purpose]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: 'No active code. Request a new one.' };
  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, reason: 'Code expired. Request a new one.' };
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    return { ok: false, reason: 'Too many attempts. Request a new one.' };
  }

  const valid = await verifyCode(code, row.code_hash);
  if (!valid) {
    await pool.query(
      `UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`,
      [row.id]
    );
    return { ok: false, reason: 'Incorrect code.' };
  }

  await pool.query(
    `UPDATE verification_codes SET consumed_at = now() WHERE id = $1`,
    [row.id]
  );
  return { ok: true };
}

// ---- Signup: request code
router.post('/signup/request-code', codeLimiter, async (req, res, next) => {
  try {
    const data = schemas.signupRequestSchema.parse(req.body);

    const taken = await pool.query('SELECT 1 FROM users WHERE email = $1', [data.adminEmail]);
    if (taken.rowCount) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const code = await issueCode(data.adminEmail, 'signup');
    await sendVerificationCode(data.adminEmail, code, 'signup');

    return res.json({ ok: true, message: 'Verification code sent to your email.' });
  } catch (err) {
    next(err);
  }
});

// ---- Signup: verify code and create company + admin
router.post('/signup/verify', async (req, res, next) => {
  try {
    const data = schemas.signupVerifySchema.parse(req.body);

    const taken = await pool.query('SELECT 1 FROM users WHERE email = $1', [data.adminEmail]);
    if (taken.rowCount) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const result = await consumeCode(data.adminEmail, 'signup', data.code);
    if (!result.ok) return res.status(400).json({ error: result.reason });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const companyRes = await client.query(
        `INSERT INTO companies (name, email) VALUES ($1, $2) RETURNING id`,
        [data.companyName, data.companyEmail]
      );
      const companyId = companyRes.rows[0].id;

      const passwordHash = await bcrypt.hash(data.password, 12);
      const userRes = await client.query(
        `INSERT INTO users (company_id, full_name, email, password_hash, role, must_change_password)
         VALUES ($1, $2, $3, $4, 'admin', false)
         RETURNING id, company_id, full_name, email, role, must_change_password`,
        [companyId, data.adminName, data.adminEmail, passwordHash]
      );
      await client.query('COMMIT');

      const user = userRes.rows[0];
      const token = signToken({
        sub: user.id,
        role: user.role,
        companyId: user.company_id,
      });
      setAuthCookie(res, token);

      await logAction({
        companyId,
        actorId: user.id,
        action: 'signup.completed',
        details: { email: user.email },
      });

      return res.json({ ok: true, user: userResponse(user) });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ---- Login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const data = schemas.loginSchema.parse(req.body);
    const { rows } = await pool.query(
      `SELECT id, company_id, full_name, email, password_hash, role, must_change_password, is_active
       FROM users WHERE email = $1`,
      [data.email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.is_active) return res.status(403).json({ error: 'Account is disabled.' });

    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    const token = signToken({
      sub: user.id,
      role: user.role,
      companyId: user.company_id,
    });
    setAuthCookie(res, token);
    await logAction({ companyId: user.company_id, actorId: user.id, action: 'auth.login' });

    return res.json({ ok: true, user: userResponse(user) });
  } catch (err) {
    next(err);
  }
});

// ---- Logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

// ---- Current user
router.get('/me', requireAuth, (req, res) => {
  return res.json({ ok: true, user: userResponse(req.user) });
});

// ---- Change own password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const data = schemas.changePasswordSchema.parse(req.body);
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const ok = await bcrypt.compare(data.oldPassword, rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(data.newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [newHash, req.user.id]
    );
    await logAction({
      companyId: req.user.company_id,
      actorId: req.user.id,
      action: 'auth.password_changed',
    });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Forgot password: request code
router.post('/forgot-password', codeLimiter, async (req, res, next) => {
  try {
    const data = schemas.forgotRequestSchema.parse(req.body);
    const { rowCount } = await pool.query(
      'SELECT 1 FROM users WHERE email = $1 AND is_active = true',
      [data.email]
    );
    if (rowCount) {
      const code = await issueCode(data.email, 'reset');
      await sendVerificationCode(data.email, code, 'reset');
    }
    return res.json({ ok: true, message: 'If the email exists, a reset code has been sent.' });
  } catch (err) {
    next(err);
  }
});

// ---- Forgot password: verify code + set new password
router.post('/forgot-password/verify', async (req, res, next) => {
  try {
    const data = schemas.forgotVerifySchema.parse(req.body);
    const result = await consumeCode(data.email, 'reset', data.code);
    if (!result.ok) return res.status(400).json({ error: result.reason });

    const newHash = await bcrypt.hash(data.newPassword, 12);
    const update = await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = false
       WHERE email = $2 AND is_active = true
       RETURNING id, company_id`,
      [newHash, data.email]
    );
    if (!update.rowCount) return res.status(400).json({ error: 'Account not found.' });

    await logAction({
      companyId: update.rows[0].company_id,
      actorId: update.rows[0].id,
      action: 'auth.password_reset_self',
    });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const helmet = require('helmet');
require('dotenv').config();

const { pool } = require('./config/db');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const predictionsRoutes = require('./routes/predictions');
const modelRoutes = require('./routes/model');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// Health
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    res.json({ ok: true, time: rows[0].now, env: process.env.NODE_ENV || 'development' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/model', modelRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Static frontend
const clientDir = path.join(__dirname, '..', '..', 'client');
app.use(express.static(clientDir));

// SPA fallback (non-API)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Errors
app.use((err, req, res, next) => {
  if (err && err.name === 'ZodError') {
    return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
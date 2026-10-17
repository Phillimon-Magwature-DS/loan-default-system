const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[pg] DATABASE_URL missing in .env');
  process.exit(1);
}

const useSSL =
  process.env.PGSSL === 'false' ||
  connectionString.includes('sslmode=false') ||
  connectionString.includes('neon.tech');

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => console.error('[pg] pool error', err));

module.exports = { pool };
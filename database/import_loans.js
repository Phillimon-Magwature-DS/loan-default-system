require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { pool } = require('../server/src/config/db');

const CSV_PATH = path.join(__dirname, 'Zimbabwe_Loan_Default_Dataset.csv');
const BATCH_SIZE = 500;

const COLS = [
  'loan_ref', 'product_code', 'amount_usd', 'annual_rate_pct', 'term_months',
  'payment_frequency', 'loan_purpose', 'client_gender', 'marital_status',
  'num_dependents', 'employment_sector', 'months_at_employer',
  'monthly_income_usd', 'existing_obligations', 'collateral_type',
  'disbursement_channel', 'province', 'defaulted',
];

function nullIfEmpty(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'nan' || lower === 'null') return null;
  return s;
}

function numOrNull(v) {
  const s = nullIfEmpty(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log('[import] reading', CSV_PATH);
  const text = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  console.log(`[import] parsed ${rows.length} rows`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE loans RESTART IDENTITY');

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const placeholders = [];
      const values = [];
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const base = j * COLS.length;
        placeholders.push('(' + COLS.map((_, k) => `$${base + k + 1}`).join(',') + ')');
        values.push(
          nullIfEmpty(row.loan_ref),
          numOrNull(row.product_code),
          numOrNull(row.amount_usd),
          numOrNull(row.annual_rate_pct),
          numOrNull(row.term_months),
          nullIfEmpty(row.payment_frequency),
          nullIfEmpty(row.loan_purpose),
          nullIfEmpty(row.client_gender),
          nullIfEmpty(row.marital_status),
          numOrNull(row.num_dependents),
          nullIfEmpty(row.employment_sector),
          numOrNull(row.months_at_employer),
          numOrNull(row.monthly_income_usd),
          numOrNull(row.existing_obligations),
          nullIfEmpty(row.collateral_type),
          nullIfEmpty(row.disbursement_channel),
          nullIfEmpty(row.province),
          numOrNull(row.defaulted),
        );
      }
      await client.query(
        `INSERT INTO loans (${COLS.join(',')}) VALUES ${placeholders.join(',')}`,
        values
      );
      inserted += batch.length;
      process.stdout.write(`\r[import] inserted ${inserted}/${rows.length}`);
    }

    await client.query('COMMIT');
    console.log('\n[import] done');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[import] failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
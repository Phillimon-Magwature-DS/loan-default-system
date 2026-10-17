BEGIN;

CREATE TABLE IF NOT EXISTS companies (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL PRIMARY KEY,
  company_id            INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('admin','user')),
  must_change_password  BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  last_login_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);

CREATE TABLE IF NOT EXISTS verification_codes (
  id           SERIAL PRIMARY KEY,
  email        TEXT NOT NULL,
  purpose      TEXT NOT NULL CHECK (purpose IN ('signup','reset')),
  code_hash    TEXT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_codes_email_purpose ON verification_codes(email, purpose);

CREATE TABLE IF NOT EXISTS predictions (
  id           SERIAL PRIMARY KEY,
  company_id   INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_data   JSONB NOT NULL,
  probability  NUMERIC(6,4) NOT NULL,
  is_default   BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_predictions_company_created ON predictions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  company_id  INT,
  actor_id    INT,
  action      TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_company_created ON audit_logs(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS loans (
  id                    SERIAL PRIMARY KEY,
  loan_ref              TEXT,
  product_code          INT,
  amount_usd            NUMERIC,
  annual_rate_pct       NUMERIC,
  term_months           INT,
  payment_frequency     TEXT,
  loan_purpose          TEXT,
  client_gender         TEXT,
  marital_status        TEXT,
  num_dependents        NUMERIC,
  employment_sector     TEXT,
  months_at_employer    NUMERIC,
  monthly_income_usd    NUMERIC,
  existing_obligations  INT,
  collateral_type       TEXT,
  disbursement_channel  TEXT,
  province              TEXT,
  defaulted             INT
);
CREATE INDEX IF NOT EXISTS idx_loans_defaulted ON loans(defaulted);

COMMIT;
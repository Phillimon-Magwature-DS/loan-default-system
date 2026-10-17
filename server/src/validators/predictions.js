const { z } = require('zod');

const num = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().finite().optional()
);

const cat = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.string().trim().max(80).optional()
);

const predictSchema = z
  .object({
    amount_usd: num,
    annual_rate_pct: num,
    term_months: num,
    payment_frequency: cat,
    product_code: num,
    loan_purpose: cat,
    client_gender: cat,
    marital_status: cat,
    num_dependents: num,
    employment_sector: cat,
    months_at_employer: num,
    monthly_income_usd: num,
    existing_obligations: num,
    collateral_type: cat,
    disbursement_channel: cat,
    province: cat,
    age_at_approval: num,
  })
  .refine(
    (obj) => Object.values(obj).some((v) => v !== undefined),
    { message: 'Provide at least one field.' }
  );

module.exports = { predictSchema };
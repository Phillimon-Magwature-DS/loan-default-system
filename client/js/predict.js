(() => {
  const FALLBACK_CATEGORIES = {
    product_code: [0, 1, 2, 3, 4, 5],
    payment_frequency: ['Bi-Weekly', 'Monthly', 'Weekly'],
    loan_purpose: [
      'Business_Expansion', 'Debt_Consolidation', 'Equipment', 'Farming_Inputs',
      'Funeral', 'Home_Improvement', 'Livestock', 'Medical', 'Personal', 'Rent',
      'School_Fees', 'Stock_Purchase', 'Vehicle', 'Wedding', 'Working_Capital',
    ],
    client_gender: ['Female', 'Male'],
    marital_status: ['Divorced', 'Married', 'Single', 'Widowed'],
    employment_sector: [
      'Agriculture', 'Construction', 'Education', 'Finance', 'Government',
      'Healthcare', 'Informal_Sector', 'Manufacturing', 'Mining', 'NGO',
      'Retail_Trade', 'Telecom', 'Transport',
    ],
    collateral_type: ['Guarantor', 'Livestock', 'Property', 'Savings', 'Vehicle'],
    disbursement_channel: ['Bank_Transfer', 'Cash', 'EcoCash', 'InnBucks', 'OneMoney'],
    province: [
      'Bulawayo', 'Harare', 'Manicaland', 'Mashonaland_Central',
      'Mashonaland_East', 'Mashonaland_West', 'Masvingo',
      'Matabeleland_North', 'Matabeleland_South', 'Midlands',
    ],
  };

  const NUMERIC_FIELDS = [
    'amount_usd', 'annual_rate_pct', 'term_months', 'num_dependents',
    'months_at_employer', 'monthly_income_usd', 'existing_obligations',
    'age_at_approval',
  ];

  const CATEGORICAL_FIELDS = [
    'product_code', 'payment_frequency', 'loan_purpose', 'client_gender',
    'marital_status', 'employment_sector', 'collateral_type',
    'disbursement_channel', 'province',
  ];

  const msg = document.getElementById('msg');
  const form = document.getElementById('predictForm');
  const submitBtn = document.getElementById('submitBtn');
  const resultPanel = document.getElementById('resultPanel');
  const resultNumber = document.getElementById('resultNumber');
  const gaugeFill = document.getElementById('gaugeFill');
  const riskBadge = document.getElementById('riskBadge');
  const recommendation = document.getElementById('resultRecommendation');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function fillSelect(id, values) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML =
      '<option value="">— select —</option>' +
      values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }

  async function loadSchema() {
    let categories = FALLBACK_CATEGORIES;
    try {
      const r = await api('/api/model/schema');
      if (r.ok && r.data.categories && Object.keys(r.data.categories).length > 0) {
        categories = r.data.categories;
      } else {
        console.warn('[predict] schema empty — using fallback categories');
      }
    } catch (e) {
      console.warn('[predict] schema fetch failed — using fallback', e);
    }
    for (const field of CATEGORICAL_FIELDS) {
      fillSelect(field, categories[field] || []);
    }
  }

  function readForm() {
    const out = {};
    for (const f of NUMERIC_FIELDS) {
      const v = document.getElementById(f).value;
      out[f] = v === '' ? null : Number(v);
    }
    for (const f of CATEGORICAL_FIELDS) {
      const v = document.getElementById(f).value;
      if (v === '') {
        out[f] = null;
      } else if (f === 'product_code') {
        out[f] = Number(v);
      } else {
        out[f] = v;
      }
    }
    return out;
  }

  function riskLevel(p) {
    if (p < 0.3) {
      return {
        key: 'low',
        badge: 'LOW RISK',
        text: 'Approve. The client presents a low risk of default.',
      };
    }
    if (p < 0.5) {
      return {
        key: 'medium',
        badge: 'MEDIUM RISK',
        text: 'Review carefully. Consider additional verification or a smaller loan amount.',
      };
    }
    return {
      key: 'high',
      badge: 'HIGH RISK',
      text: 'Decline or require stronger collateral. High probability of default.',
    };
  }

  function renderResult(prediction) {
    const p = Number(prediction.probability);
    const pct = (p * 100).toFixed(1);
    const level = riskLevel(p);

    resultPanel.style.display = 'block';
    resultPanel.className = 'card result-panel risk-' + level.key;
    resultNumber.textContent = pct + '%';
    gaugeFill.style.width = Math.min(100, p * 100) + '%';
    gaugeFill.className = 'gauge-fill fill-' + level.key;
    riskBadge.textContent = level.badge;
    riskBadge.className = 'risk-badge badge-' + level.key;
    recommendation.textContent = level.text;

    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.addEventListener('authready', async (ev) => {
    const u = ev.detail;
    document.getElementById('userLine').innerHTML =
      '<strong>' + esc(u.full_name) + '</strong> · ' + esc(u.role);
    await loadSchema();
  });

  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login.html');
  });

  document.getElementById('newPredictionBtn').addEventListener('click', () => {
    resultPanel.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  form.addEventListener('reset', () => {
    resultPanel.style.display = 'none';
    msg.style.display = 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.style.display = 'none';

    const payload = readForm();
    const hasAny = Object.values(payload).some((v) => v !== null);
    if (!hasAny) {
      showErr(msg, 'Fill in at least one field before submitting.');
      return;
    }

    if (payload.age_at_approval !== null) {
      if (payload.age_at_approval < 18 || payload.age_at_approval > 100) {
        showErr(msg, 'Age at approval must be between 18 and 100.');
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Assessing…';

    const r = await api('/api/predictions', { method: 'POST', body: payload });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Assess risk';

    if (!r.ok) {
      showErr(msg, (r.data && r.data.error) || 'Prediction failed.');
      return;
    }

    renderResult(r.data.prediction);
  });
})();
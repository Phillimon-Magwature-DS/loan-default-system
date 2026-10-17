(() => {
  let user = null;
  const charts = {};
  const loaded = { overview: false, dataset: false, model: false };

  const fmtInt = (n) => Number(n || 0).toLocaleString();
  const fmtPct = (n) => Number(n || 0).toFixed(1) + '%';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function kpiCard(label, value, sub) {
    return `<div class="kpi-card">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value">${esc(value)}</div>
      ${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}
    </div>`;
  }

  function destroyChart(key) {
    if (charts[key]) { charts[key].destroy(); charts[key] = null; }
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'dataset' && !loaded.dataset) loadDataset();
        if (btn.dataset.tab === 'model' && !loaded.model) loadModelInsights();
      });
    });
  }

  // --- Overview
  async function loadOverview() {
    loaded.overview = true;
    const [sRes, tRes] = await Promise.all([
      api('/api/dashboard/summary'),
      api('/api/dashboard/predictions-trend'),
    ]);

    if (sRes.ok) {
      const s = sRes.data.summary;
      const scopeText = s.scope === 'company' ? 'Company-wide activity' : 'Your activity';
      document.getElementById('scopeLine').textContent = scopeText + ' · last 30 days';

      const cards = [
        kpiCard('Total predictions', fmtInt(s.total_predictions)),
        kpiCard('Avg probability', fmtPct(Number(s.avg_probability) * 100)),
        kpiCard('High-risk count', fmtInt(s.high_risk), 'Probability ≥ 50%'),
        kpiCard(
          'Last prediction',
          s.last_prediction_at ? new Date(s.last_prediction_at).toLocaleDateString() : '—'
        ),
      ];
      if (s.scope === 'company' && s.users) {
        cards.push(
          kpiCard('Total users', fmtInt(s.users.total_users), fmtInt(s.users.active_users) + ' active'),
          kpiCard('Admins', fmtInt(s.users.total_admins))
        );
      }
      document.getElementById('kpiGrid').innerHTML = cards.join('');
    } else {
      document.getElementById('kpiGrid').innerHTML =
        kpiCard('Summary', '—', 'Could not load');
    }

    if (tRes.ok) renderTrend(tRes.data.trend || []);
  }

  function renderTrend(trend) {
    const days = 30;
    const map = new Map(trend.map((r) => [r.day, r.count]));
    const labels = [];
    const values = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
      values.push(map.get(key) || 0);
    }

    destroyChart('trend');
    const ctx = document.getElementById('trendChart').getContext('2d');
    charts.trend = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Predictions',
          data: values,
          borderColor: '#0B2A4A',
          backgroundColor: 'rgba(62, 142, 196, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        },
      },
    });
  }

  // --- Dataset insights
  async function loadDataset() {
    loaded.dataset = true;
    const r = await api('/api/dashboard/dataset-charts');
    if (!r.ok) {
      document.getElementById('datasetKpiGrid').innerHTML =
        kpiCard('Dataset', '—', 'Could not load');
      return;
    }
    const d = r.data;

    document.getElementById('datasetKpiGrid').innerHTML = [
      kpiCard('Loans in dataset', fmtInt(d.overall.total_loans)),
      kpiCard('Defaults', fmtInt(d.overall.total_defaults)),
      kpiCard('Overall default rate', fmtPct(d.overall.default_rate)),
    ].join('');

    renderHorizontalBar('purposeChart', 'purpose', d.by_purpose, '#3E8EC4');
    renderHorizontalBar('sectorChart', 'sector', d.by_sector, '#0B2A4A');
    renderHorizontalBar('collateralChart', 'collateral', d.by_collateral, '#5A6B7B');
    renderRateBuckets(d.rate_buckets);
  }

  function renderHorizontalBar(canvasId, key, rows, color) {
    destroyChart(key);
    const ctx = document.getElementById(canvasId).getContext('2d');
    charts[key] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.label),
        datasets: [{
          label: 'Default rate (%)',
          data: rows.map((r) => r.rate),
          backgroundColor: color,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.parsed.x.toFixed(2)}%`,
              afterLabel: (item) => {
                const row = rows[item.dataIndex];
                return `${row.defaults.toLocaleString()} / ${row.total.toLocaleString()} loans`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: 'Default rate (%)' },
            ticks: { callback: (v) => v + '%' },
          },
          y: { ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  function renderRateBuckets(rows) {
    destroyChart('rateBucket');
    const ctx = document.getElementById('rateBucketChart').getContext('2d');
    charts.rateBucket = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.bucket + '%'),
        datasets: [{
          label: 'Default rate (%)',
          data: rows.map((r) => r.rate),
          backgroundColor: '#C43D3D',
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.parsed.y.toFixed(2)}%`,
              afterLabel: (item) => {
                const row = rows[item.dataIndex];
                return `${row.defaults.toLocaleString()} / ${row.total.toLocaleString()} loans`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Default rate (%)' },
            ticks: { callback: (v) => v + '%' },
          },
          x: { title: { display: true, text: 'Interest rate bucket' } },
        },
      },
    });
  }

  // --- Model insights
  async function loadModelInsights() {
    loaded.model = true;
    const r = await api('/api/model/feature-importance');
    if (!r.ok) return;
    renderFeatureImportance(r.data.feature_importance || []);
  }

  function renderFeatureImportance(data) {
    const sorted = [...data].sort((a, b) => a.importance - b.importance);
    destroyChart('fi');
    const ctx = document.getElementById('fiChart').getContext('2d');
    charts.fi = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map((d) => d.field),
        datasets: [{
          label: 'Relative importance',
          data: sorted.map((d) => d.importance),
          backgroundColor: '#3E8EC4',
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => (item.parsed.x * 100).toFixed(2) + '%',
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: 'Relative importance' },
            ticks: { callback: (v) => (Number(v) * 100).toFixed(0) + '%' },
          },
        },
      },
    });
  }

  // --- Init
  setupTabs();

  window.addEventListener('authready', (ev) => {
    user = ev.detail;
    document.getElementById('userLine').innerHTML =
      '<strong>' + esc(user.full_name) + '</strong> · ' + esc(user.role);
    if (user.role === 'admin') {
      document.getElementById('tabMgmt').style.display = '';
    }
    loadOverview();
  });

  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login.html');
  });
})();
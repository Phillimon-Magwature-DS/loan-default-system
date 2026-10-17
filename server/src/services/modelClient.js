const MODEL_URL = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';

async function callModel(path, { method = 'GET', body, timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(MODEL_URL + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail =
        (data && (data.detail || data.error)) || `Model service returned ${res.status}`;
      const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      err.status = 502;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('Model service timed out');
      e.status = 504;
      throw e;
    }
    if (err.status) throw err;
    const e = new Error(`Model service unreachable: ${err.message}`);
    e.status = 503;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function predict(inputs) {
  return callModel('/predict', { method: 'POST', body: inputs });
}
async function getFeatureImportance() {
  return callModel('/feature-importance');
}
async function getSchema() {
  return callModel('/schema');
}

module.exports = { predict, getFeatureImportance, getSchema };
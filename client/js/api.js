async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, data };
}

function showErr(el, msg) {
  el.textContent = msg || 'Something went wrong.';
  el.className = 'msg msg-err';
  el.style.display = 'block';
}

function showOk(el, msg) {
  el.textContent = msg;
  el.className = 'msg msg-ok';
  el.style.display = 'block';
}
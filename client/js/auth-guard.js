(async () => {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    window.location.replace('/login.html');
    return;
  }
  const { user } = await res.json();
  const onChangePw = location.pathname.endsWith('/change-password.html');
  if (user.must_change_password && !onChangePw) {
    window.location.replace('/change-password.html');
    return;
  }
  window.__user = user;
  window.dispatchEvent(new CustomEvent('authready', { detail: user }));
})();
const COOKIE_NAME = 'lds_token';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_MS,
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie };
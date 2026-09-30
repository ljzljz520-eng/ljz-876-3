'use strict';
const Api = (() => {
  const TOKEN_KEY = 'sanji_token';
  const USER_KEY = 'sanji_user';

  function token() { return localStorage.getItem(TOKEN_KEY); }
  function user() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
  function setSession(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  function clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

  async function request(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const t = token();
    if (t) opts.headers.Authorization = 'Bearer ' + t;
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opts);
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || '请求失败 (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    token, user, setSession, clear,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b || {}),
  };
})();

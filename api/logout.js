const { readSession } = require('../lib/auth');
const db = require('../lib/db');
const { send, getCookie, cookieHeader, sameOrigin } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  // سشن را مستقیم بخوان (بدون currentUser چون داریم خودمان را revoke می‌کنیم)
  const session = readSession(getCookie(req, 'mr_session'));
  if (session && session.sid) {
    try { await db.revokeSession(session.sid); } catch (e) { /* ignore */ }
  }
  return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) });
};

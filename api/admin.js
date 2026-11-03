// Admin panel API — ONLY accessible to account A (enforced server-side).
const db = require('../lib/db');
const { send, currentUser, sameOrigin, readBody } = require('../lib/http');

module.exports = async function handler(req, res) {
  try {
    const me = await currentUser(req);
    // بررسی سرور-ساید: فقط A می‌تواند وارد شود
    if (!me || me.who !== 'a') return send(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const sessions = await db.listDeviceSessions();
      return send(res, 200, { sessions });
    }

    if (req.method === 'DELETE') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
      const sid = readBody(req).sid;
      if (typeof sid !== 'string' || sid.length < 10) return send(res, 400, { error: 'invalid' });
      if (sid === me.sid) return send(res, 400, { error: 'cannot_revoke_self' });
      await db.revokeSession(sid);
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method' });
  } catch (e) {
    console.error('admin error:', e.message);
    return send(res, 500, { error: 'server' });
  }
};

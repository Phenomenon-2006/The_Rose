const crypto = require('crypto');
const { verifyPassword, createSession, hashIp, SESSION_DAYS } = require('../lib/auth');
const { identities } = require('../lib/config');
const db = require('../lib/db');
const { send, cookieHeader, sameOrigin, readBody, clientIp } = require('../lib/http');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  try {
    const password = readBody(req).password;
    if (typeof password !== 'string' || password.length < 1 || password.length > 200) {
      return send(res, 400, { error: 'invalid' });
    }

    const ipHash = hashIp(clientIp(req));
    const f = await db.recentFailures(ipHash);
    if (f.mine >= 8 || f.all >= 40) return send(res, 429, { error: 'too_many' });

    // Check all three on purpose (same work for every guess), then pick the match.
    const ids = identities();
    let matched = null;
    ['a', 'b', 'test'].forEach((k) => {
      if (verifyPassword(password, ids[k].hash) && !matched) matched = k;
    });

    if (!matched) {
      await db.recordFailure(ipHash);
      await wait(500);
      return send(res, 401, { error: 'invalid' });
    }

    const sid = crypto.randomBytes(20).toString('hex');
    try { await db.upsertDeviceSession(sid, matched, req.headers['user-agent'] || ''); } catch (e) { /* اگر ثبت دستگاه ناموفق شد، ورود را متوقف نکن */ }
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(createSession(matched, sid), SESSION_DAYS * 86400) });
  } catch (e) {
    console.error('login error:', e.message);
    return send(res, 500, { error: 'server' });
  }
};

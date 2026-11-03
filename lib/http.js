// Small helpers shared by the API files (works on Vercel and in tools/dev-server.js).
const { readSession } = require('./auth');
const { identities } = require('./config');
const db = require('./db');

function send(res, status, obj, extraHeaders) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extraHeaders) Object.keys(extraHeaders).forEach((k) => res.setHeader(k, extraHeaders[k]));
  res.end(JSON.stringify(obj));
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.indexOf(name + '=') === 0) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function cookieHeader(value, maxAge) {
  const secure = process.env.MR_DEV === '1' ? '' : '; Secure';
  return 'mr_session=' + encodeURIComponent(value) + '; HttpOnly' + secure + '; SameSite=Strict; Path=/; Max-Age=' + maxAge;
}

// Who is calling? Returns { who, room, name } or null. Room + name come from the server config.
async function currentUser(req) {
  const s = readSession(getCookie(req, 'mr_session'));
  if (!s) return null;
  const id = identities()[s.who];
  if (!id) return null;
  // اگر session دارای sid است، بررسی کن که revoke نشده باشد
  if (s.sid) {
    try {
      const ok = await db.checkSession(s.sid);
      if (!ok) return null;
    } catch (e) { /* اگر DB در دسترس نیست، fail-open */ }
  }
  return { who: s.who, room: id.room, name: id.name, sid: s.sid };
}
// Extra CSRF protection on top of SameSite=Strict: a browser POST must come from our own site.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch (e) { b = null; }
  }
  return b && typeof b === 'object' ? b : {};
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = { send, getCookie, cookieHeader, currentUser, sameOrigin, readBody, clientIp };

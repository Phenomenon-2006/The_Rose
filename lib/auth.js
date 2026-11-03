// Password hashing + signed session cookies. Uses only Node's built-in "crypto" (no dependencies).
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1 };
const SESSION_DAYS = 30;

// ---- passwords -------------------------------------------------------------
// Stored format:  s1:<salt hex>:<hash hex>   (made by tools/setup-secrets.js)
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password).normalize('NFKC'), salt, 32, SCRYPT);
  return 's1:' + salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.trim().split(':');
  if (parts.length !== 3 || parts[0] !== 's1') return false;
  try {
    const expected = Buffer.from(parts[2], 'hex');
    const got = crypto.scryptSync(String(password).normalize('NFKC'), Buffer.from(parts[1], 'hex'), expected.length, SCRYPT);
    return expected.length === got.length && crypto.timingSafeEqual(expected, got);
  } catch (e) {
    return false;
  }
}

// ---- sessions --------------------------------------------------------------
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is missing or too short (min 32 chars)');
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(data) {
  return b64url(crypto.createHmac('sha256', secret()).update(data).digest());
}

// "who" is one of: a, b, test. Nothing else is stored in the cookie.
function createSession(who, sid) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const body = b64url(JSON.stringify({ w: who, e: exp, s: sid || null }));
  return body + '.' + sign(body);
}

function readSession(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const good = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!data || typeof data.e !== 'number' || data.e < Date.now() / 1000) return null;
    if (data.w !== 'a' && data.w !== 'b' && data.w !== 'test') return null;
    return { who: data.w, sid: data.s || null };
  } catch (e) {
    return null;
  }
}

function hashIp(ip) {
  return crypto.createHmac('sha256', secret()).update('ip:' + ip).digest('hex').slice(0, 32);
}

module.exports = { hashPassword, verifyPassword, createSession, readSession, hashIp, SESSION_DAYS };

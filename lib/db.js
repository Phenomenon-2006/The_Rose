// Tiny Supabase (PostgREST) client using plain fetch. No packages needed, so it is easy to
// move to another PostgreSQL + PostgREST host later. Runs ONLY on the server.
function conf() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
  return { url, key };
}

async function rest(method, path, body, prefer) {
  const { url, key } = conf();
  const headers = { apikey: key, Authorization: 'Bearer ' + key };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(url + '/rest/v1/' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Database error ' + res.status + ': ' + text.slice(0, 200));
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const COLS = 'id,sender_key,sender_name,content,created_at';

// Messages of ONE room. mode: {after:id} -> newer ones, {before:id} -> older page, {} -> latest page.
async function listMessages(room, opts, limit) {
  const r = 'room_id=eq.' + encodeURIComponent(room);
  if (opts.after) {
    const rows = await rest('GET', 'messages?select=' + COLS + '&' + r + '&id=gt.' + Number(opts.after) + '&order=id.asc&limit=200');
    return { rows, hasMore: false };
  }
  const before = opts.before ? '&id=lt.' + Number(opts.before) : '';
  const rows = await rest('GET', 'messages?select=' + COLS + '&' + r + before + '&order=id.desc&limit=' + (limit + 1));
  const hasMore = rows.length > limit;
  return { rows: rows.slice(0, limit).reverse(), hasMore };
}

async function insertMessage(room, senderKey, senderName, content) {
  const rows = await rest('POST', 'messages', [{ room_id: room, sender_key: senderKey, sender_name: senderName, content }], 'return=representation');
  return rows[0];
}

// ---- login rate limiting ---------------------------------------------------
async function recentFailures(ipHash) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const mine = await rest('GET', 'login_attempts?select=id&ip_hash=eq.' + ipHash + '&created_at=gte.' + encodeURIComponent(since) + '&limit=20');
  const all = await rest('GET', 'login_attempts?select=id&created_at=gte.' + encodeURIComponent(since) + '&limit=60');
  return { mine: mine.length, all: all.length };
}

async function recordFailure(ipHash) {
  await rest('POST', 'login_attempts', [{ ip_hash: ipHash }]);
  const old = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await rest('DELETE', 'login_attempts?created_at=lt.' + encodeURIComponent(old));
}

// ---- device sessions -------------------------------------------------------
function parseUA(ua) {
  if (!ua) return { device_type: 'ناشناس', os: '—', browser: '—' };
  let device = 'Desktop';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android.*Mobile/.test(ua)) device = 'Android Phone';
  else if (/Android/.test(ua)) device = 'Android Tablet';
  let os = '—';
  const iosM = ua.match(/OS (\d+[_\d]*) like Mac/);
  if (iosM) os = 'iOS ' + iosM[1].replace(/_/g, '.');
  else if (/Android/.test(ua)) { const m = ua.match(/Android ([\d.]+)/); os = 'Android ' + (m ? m[1] : ''); }
  else if (/Windows NT/.test(ua)) { const m = ua.match(/Windows NT ([\d.]+)/); const v = {'10.0':'10/11','6.3':'8.1','6.2':'8','6.1':'7'}; os = 'Windows ' + (v[m&&m[1]] || (m&&m[1]) || ''); }
  else if (/Mac OS X/.test(ua)) { const m = ua.match(/Mac OS X ([\d_]+)/); os = 'macOS ' + (m ? m[1].replace(/_/g, '.') : ''); }
  else if (/CrOS/.test(ua)) os = 'Chrome OS';
  else if (/Linux/.test(ua)) os = 'Linux';
  let browser = '—';
  if (/Edg\//.test(ua)) { const m = ua.match(/Edg\/([\d]+)/); browser = 'Edge ' + (m ? m[1] : ''); }
  else if (/SamsungBrowser/.test(ua)) { const m = ua.match(/SamsungBrowser\/([\d.]+)/); browser = 'Samsung ' + (m ? m[1] : ''); }
  else if (/OPR\//.test(ua)) { const m = ua.match(/OPR\/([\d]+)/); browser = 'Opera ' + (m ? m[1] : ''); }
  else if (/Chrome\//.test(ua)) { const m = ua.match(/Chrome\/([\d]+)/); browser = 'Chrome ' + (m ? m[1] : ''); }
  else if (/Firefox\//.test(ua)) { const m = ua.match(/Firefox\/([\d]+)/); browser = 'Firefox ' + (m ? m[1] : ''); }
  else if (/Safari\//.test(ua)) { const m = ua.match(/Version\/([\d]+)/); browser = 'Safari ' + (m ? m[1] : ''); }
  return { device_type: device, os, browser };
}

async function upsertDeviceSession(sid, who, ua) {
  const { device_type, os, browser } = parseUA(ua);
  const now = new Date().toISOString();
  await rest('POST', 'device_sessions',
    [{ id: sid, who, ua_raw: (ua || '').slice(0, 400), device_type, os, browser, created_at: now, last_seen: now }]);
}

async function checkSession(sid) {
  const rows = await rest('GET', 'device_sessions?id=eq.' + encodeURIComponent(sid) + '&revoked=eq.false&select=id&limit=1');
  return rows && rows.length > 0;
}

async function touchSession(sid) {
  if (!sid) return;
  await rest('PATCH', 'device_sessions?id=eq.' + encodeURIComponent(sid) + '&revoked=eq.false', { last_seen: new Date().toISOString() });
}

async function listDeviceSessions() {
  return rest('GET', 'device_sessions?select=id,who,device_type,os,browser,created_at,last_seen,revoked&order=last_seen.desc&limit=300');
}

async function revokeSession(sid) {
  await rest('PATCH', 'device_sessions?id=eq.' + encodeURIComponent(sid), { revoked: true });
}

module.exports = { rest, listMessages, insertMessage, recentFailures, recordFailure, upsertDeviceSession, checkSession, touchSession, listDeviceSessions, revokeSession };

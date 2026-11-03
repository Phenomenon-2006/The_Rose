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

module.exports = { rest, listMessages, insertMessage, recentFailures, recordFailure };

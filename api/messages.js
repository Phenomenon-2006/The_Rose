const db = require('../lib/db');
const { send, currentUser, sameOrigin, readBody } = require('../lib/http');

const PAGE = 100;

function shape(row, me) {
  return {
    id: Number(row.id),
    who: row.sender_key,
    name: row.sender_name,
    content: row.content,
    at: row.created_at,
    mine: row.sender_key === me.who,
  };
}

// Remove control characters (keep new lines and tabs) and trim.
function clean(text) {
  return String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim();
}

module.exports = async function handler(req, res) {
  try {
    const me = currentUser(req);
    if (!me) return send(res, 401, { error: 'auth' });

    // The room ALWAYS comes from the server-side identity. Any "room" sent by the browser is ignored.
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams;
      const after = parseInt(q.get('after'), 10);
      const before = parseInt(q.get('before'), 10);
      const opts = {};
      if (after > 0) opts.after = after;
      else if (before > 0) opts.before = before;
      const out = await db.listMessages(me.room, opts, PAGE);
      return send(res, 200, { messages: out.rows.map((r) => shape(r, me)), hasMore: out.hasMore });
    }

    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
      const raw = readBody(req).content;
      if (typeof raw !== 'string') return send(res, 400, { error: 'invalid' });
      const content = clean(raw);
      if (content.length < 1) return send(res, 400, { error: 'empty' });
      if (content.length > 2000) return send(res, 400, { error: 'too_long' });
      const row = await db.insertMessage(me.room, me.who, me.name, content);
      return send(res, 201, { message: shape(row, me) });
    }

    return send(res, 405, { error: 'method' });
  } catch (e) {
    console.error('messages error:', e.message);
    return send(res, 500, { error: 'server' });
  }
};

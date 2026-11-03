// In-memory fake of the few Supabase REST calls we use. ONLY for local preview/tests
// (node tools/dev-server.js with no .env). Real data always lives in Supabase.
function install() {
  const tables = { messages: [], login_attempts: [] };
  const seq = { messages: 0, login_attempts: 0 };
  const realFetch = global.fetch;

  global.fetch = async function (input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.host !== 'mock.local') return realFetch(input, init);
    const table = url.pathname.replace('/rest/v1/', '');
    const t = tables[table];
    const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
    if (!t) return reply(404, { message: 'no such table' });
    const method = (init && init.method) || 'GET';
    const q = url.searchParams;

    const matches = (row) => {
      for (const [k, v] of q.entries()) {
        if (['select', 'order', 'limit'].includes(k)) continue;
        const m = String(v).match(/^(eq|gt|lt|gte)\.(.*)$/);
        if (!m) continue;
        const a = row[k] !== undefined && /^\d+$/.test(String(row[k])) && /^\d+$/.test(m[2]) ? Number(row[k]) : row[k];
        const b = /^\d+$/.test(m[2]) && typeof a === 'number' ? Number(m[2]) : m[2];
        if (m[1] === 'eq' && a !== b) return false;
        if (m[1] === 'gt' && !(a > b)) return false;
        if (m[1] === 'lt' && !(a < b)) return false;
        if (m[1] === 'gte' && !(a >= b)) return false;
      }
      return true;
    };

    if (method === 'GET') {
      let rows = t.filter(matches);
      const order = q.get('order');
      if (order === 'id.desc') rows = rows.slice().sort((a, b) => b.id - a.id);
      else rows = rows.slice().sort((a, b) => a.id - b.id);
      if (q.get('limit')) rows = rows.slice(0, Number(q.get('limit')));
      return reply(200, rows);
    }
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      const made = body.map((r) => {
        if (table === 'messages') {
          const pairOk = (r.room_id === 'main' && ['a', 'b'].includes(r.sender_key)) || (r.room_id === 'test' && r.sender_key === 'test');
          if (!pairOk || !r.content || r.content.length > 2000) return null;
        }
        const row = Object.assign({}, r, { id: ++seq[table], created_at: r.created_at || new Date().toISOString() });
        t.push(row);
        return row;
      });
      if (made.includes(null)) return reply(400, { message: 'constraint violation' });
      return reply(201, made);
    }
    if (method === 'DELETE') {
      for (let i = t.length - 1; i >= 0; i--) if (matches(t[i])) t.splice(i, 1);
      return reply(204);
    }
    return reply(405, {});
  };
  return tables;
}

module.exports = { install };

const { send, currentUser } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  try {
    const me = await currentUser(req);
    if (!me) return send(res, 401, { error: 'auth' });
    return send(res, 200, { ok: true, name: me.name, who: me.who, isTest: me.room === 'test' });
  } catch (e) {
    console.error('me error:', e.message);
    return send(res, 500, { error: 'server' });
  }
};

const { send, cookieHeader, sameOrigin } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) });
};

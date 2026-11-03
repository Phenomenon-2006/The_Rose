// Local preview:  node tools/dev-server.js   then open http://localhost:3000
// - With a ".env" file: uses your real Supabase project.
// - Without one: uses a throw-away in-memory database and demo passwords (printed below).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('./env');
loadEnv();
process.env.MR_DEV = '1';

if (!process.env.SUPABASE_URL) {
  require('./mock-db').install();
  const { hashPassword } = require('../lib/auth');
  process.env.SUPABASE_URL = 'http://mock.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  process.env.PASSWORD_HASH_A = hashPassword('rose-a');
  process.env.PASSWORD_HASH_B = hashPassword('rose-b');
  process.env.PASSWORD_HASH_TEST = hashPassword('rose-test');
  process.env.NAME_A = process.env.NAME_A || 'آ';
  process.env.NAME_B = process.env.NAME_B || 'ب';
  console.log('PREVIEW MODE (no .env): fake in-memory database. Demo passwords: rose-a / rose-b / rose-test');
}

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// Use the same security headers as vercel.json
const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
const secHeaders = vercel.headers[0].headers;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.indexOf('/api/') === 0) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
    const file = path.join(__dirname, '..', 'api', name + '.js');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('{}'); }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
      await require(file)(req, res);
    });
    return;
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (full.indexOf(PUBLIC) !== 0 || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  secHeaders.forEach((h) => res.setHeader(h.key, h.value));
  res.setHeader('Content-Type', TYPES[path.extname(full)] || 'application/octet-stream');
  fs.createReadStream(full).pipe(res);
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log('Open http://localhost:' + port));

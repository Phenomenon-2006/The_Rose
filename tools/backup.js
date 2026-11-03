// Manual backup. Run on YOUR computer:   node tools/backup.js
// Needs a local ".env" file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// Writes:  backups/midnight-rose-YYYY-MM-DD_HH-MM.json  (+ readable .txt transcripts)
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env');
loadEnv();
const db = require('../lib/db');

async function fetchAll(table, cols) {
  const out = [];
  let last = 0;
  for (;;) {
    const rows = await db.rest('GET', table + '?select=' + cols + '&id=gt.' + last + '&order=id.asc&limit=1000');
    out.push.apply(out, rows);
    if (rows.length < 1000) break;
    last = rows[rows.length - 1].id;
  }
  return out;
}

(async () => {
  const messages = await fetchAll('messages', 'id,room_id,sender_key,sender_name,content,created_at');
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const base = path.join(dir, 'midnight-rose-' + stamp);
  fs.writeFileSync(base + '.json', JSON.stringify({ app: 'midnight-rose', version: 1, exported_at: new Date().toISOString(), messages }, null, 1));

  ['main', 'test'].forEach((room) => {
    const text = messages
      .filter((m) => m.room_id === room)
      .map((m) => '[' + m.created_at + '] ' + m.sender_name + ': ' + m.content)
      .join('\n\n');
    fs.writeFileSync(base + '-' + room + '.txt', text + '\n');
  });

  const count = (r) => messages.filter((m) => m.room_id === r).length;
  console.log('Backup saved in the "backups" folder:');
  console.log('  ' + path.basename(base) + '.json   (everything - use this to restore)');
  console.log('  ' + path.basename(base) + '-main.txt / -test.txt   (readable transcripts)');
  console.log('Main room messages: ' + count('main') + ' | Test room messages: ' + count('test'));
})().catch((e) => { console.error('Backup failed:', e.message); process.exit(1); });

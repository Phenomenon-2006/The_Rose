// Restore messages from a backup .json file:   node tools/restore.js backups/FILE.json
// Safety: refuses to run if the database already has messages, unless you add --append.
const fs = require('fs');
const { loadEnv } = require('./env');
loadEnv();
const db = require('../lib/db');

(async () => {
  const file = process.argv[2];
  const append = process.argv.includes('--append');
  if (!file) { console.log('Usage: node tools/restore.js backups/FILE.json [--append]'); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.app !== 'midnight-rose' || !Array.isArray(data.messages)) throw new Error('This is not a Midnight Rose backup file.');

  const existing = await db.rest('GET', 'messages?select=id&limit=1');
  if (existing.length && !append) {
    console.log('The database already contains messages. Nothing was changed.');
    console.log('Restoring into a non-empty database would create duplicates. Use --append only if you are sure.');
    process.exit(1);
  }

  const rows = data.messages
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((m) => ({ room_id: m.room_id, sender_key: m.sender_key, sender_name: m.sender_name, content: m.content, created_at: m.created_at }));

  for (let i = 0; i < rows.length; i += 200) {
    await db.rest('POST', 'messages', rows.slice(i, i + 200));
  }
  console.log('Restored ' + rows.length + ' messages.');
})().catch((e) => { console.error('Restore failed:', e.message); process.exit(1); });

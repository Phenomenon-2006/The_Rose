// Creates the secret values for the site. Run:  node tools/setup-secrets.js
// It asks for the three passwords (hidden), then prints lines to paste into Vercel.
// Your real passwords are never saved anywhere - only their scrypt hashes are printed.
const readline = require('readline');
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('../lib/auth');

const interactive = !!process.stdin.isTTY;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
let muted = false;
rl._writeToOutput = function (s) {
  if (!muted) return rl.output.write(s);
  rl.output.write(s.indexOf('\n') >= 0 ? '\n' : '*');
};

// When input is piped (not typed), read the lines into a queue instead.
const queue = [];
let waiting = null;
if (!interactive) {
  rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else queue.push(l); });
}

function ask(q, hidden) {
  return new Promise((resolve) => {
    muted = false;
    if (!interactive) {
      process.stdout.write(q);
      if (queue.length) return resolve(queue.shift());
      waiting = resolve;
      return;
    }
    rl.question(q, (a) => { muted = false; resolve(a); });
    muted = !!hidden;
  });
}

async function askPassword(label, taken = []) {
  for (;;) {
    const p = await ask(label + ': ', true);
    if (p.length < 6) { console.log('  Use at least 6 characters.'); continue; }
    if (taken.some((t) => t === p)) { console.log('  This must be different from the other passwords.'); continue; }
    const again = await ask('Type it again: ', true);
    if (again !== p) { console.log('  They did not match. Try again.'); continue; }
    return p;
  }
}

(async () => {
  console.log('\nMidnight Rose - secret setup\n');
  const nameA = (await ask('Display name for participant A (shown above messages): ')).trim() || 'A';
  const nameB = (await ask('Display name for participant B: ')).trim() || 'B';
  const pa = await askPassword('Password for participant A');
  const pb = await askPassword('Password for participant B', [pa]);
  const pt = await askPassword('Password for the TEST room', [pa, pb]);
  rl.close();

  const hashes = { A: hashPassword(pa), B: hashPassword(pb), TEST: hashPassword(pt) };
  if (!verifyPassword(pa, hashes.A)) throw new Error('self-check failed');

  console.log('\n----- Copy these into Vercel > Settings > Environment Variables -----\n');
  console.log('SESSION_SECRET=' + crypto.randomBytes(48).toString('hex'));
  console.log('PASSWORD_HASH_A=' + hashes.A);
  console.log('PASSWORD_HASH_B=' + hashes.B);
  console.log('PASSWORD_HASH_TEST=' + hashes.TEST);
  console.log('NAME_A=' + nameA);
  console.log('NAME_B=' + nameB);
  console.log('\n(Do not share this output publicly. To change a password later, run this again and replace the values.)\n');
})();

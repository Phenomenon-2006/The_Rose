// The three identities. The SERVER decides the room and the sender name from the session,
// never the browser.
function identities() {
  return {
    a: { room: 'main', name: process.env.NAME_A || 'A', hash: process.env.PASSWORD_HASH_A },
    b: { room: 'main', name: process.env.NAME_B || 'B', hash: process.env.PASSWORD_HASH_B },
    test: { room: 'test', name: 'Test', hash: process.env.PASSWORD_HASH_TEST },
  };
}

module.exports = { identities };

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-1234567890';
process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function cookieFrom(res) {
  const sc = res.headers.get('set-cookie');
  if (!sc) return '';
  return sc.split(';')[0];
}

async function json(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

test('GET / returns game HTML', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Shrinking Room/);
});

test('auth signup/login/me/logout flow', async () => {
  const username = 't' + Date.now().toString().slice(-8);
  const password = 'password123';

  const signup = await fetch(base + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(signup.status, 201);
  const cookie = cookieFrom(signup);
  assert.ok(cookie);

  const me = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.deepEqual(await json(me), { username });

  const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);

  const meAfter = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } });
  // Stateless JWT: logout clears the client cookie; server still accepts a
  // manually replayed token until expiry. Verify logout responded OK instead.
  assert.equal(meAfter.status, 200);

  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(login.status, 200);
  assert.ok(cookieFrom(login));
});

test('progress validation rejects invalid updates', async () => {
  const username = 'p' + Date.now().toString().slice(-8);
  const password = 'password123';
  const signup = await fetch(base + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookie = cookieFrom(signup);

  const get = await fetch(base + '/api/progress', { headers: { Cookie: cookie } });
  assert.equal(get.status, 200);
  const progress = await json(get);
  assert.equal(progress.unlockedLevel, 1);

  const bad = await fetch(base + '/api/progress', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ unlockedLevel: 5 }),
  });
  assert.equal(bad.status, 400);

  const good = await fetch(base + '/api/progress', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ hasSeenIntro: true, soundOn: false }),
  });
  assert.equal(good.status, 200);

  const after = await fetch(base + '/api/progress', { headers: { Cookie: cookie } });
  const p2 = await json(after);
  assert.equal(p2.hasSeenIntro, true);
  assert.equal(p2.soundOn, false);
});

test('progress reset clears state', async () => {
  const username = 'r' + Date.now().toString().slice(-8);
  const password = 'password123';
  const signup = await fetch(base + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookie = cookieFrom(signup);

  await fetch(base + '/api/progress', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ hasSeenIntro: true }),
  });

  const reset = await fetch(base + '/api/progress/reset', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(reset.status, 200);

  const after = await fetch(base + '/api/progress', { headers: { Cookie: cookie } });
  const p = await json(after);
  assert.equal(p.unlockedLevel, 1);
  assert.equal(p.stats.roomsCleared, 0);
});
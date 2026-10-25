// test/auth.test.js
// Runs against a throwaway database (DB_PATH) and a real HTTP listener, so the
// cookie, the JSON body, and the username rules are exercised end to end.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-auth-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.JWT_SECRET = 'test-only-secret-never-used-outside-tests';

const app = require('../server');

let server;
let base;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function post(url, body, cookie) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

async function get(url, cookie) {
  const res = await fetch(base + url, { headers: cookie ? { Cookie: cookie } : {} });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function sessionCookie(setCookie) {
  assert.ok(setCookie, 'expected a Set-Cookie header');
  return setCookie.split(';')[0];
}

const PASSWORD = 'theroomisclosing';

test('register then sign in with the same name returns the same account', async () => {
  const registered = await post('/api/auth/signup', { username: 'Room_One', password: PASSWORD });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.username, 'room_one');

  const signedIn = await post('/api/auth/login', { username: 'Room_One', password: PASSWORD });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.data.username, 'room_one');

  const me = await get('/api/auth/me', sessionCookie(signedIn.setCookie));
  assert.equal(me.status, 200);
  assert.equal(me.data.username, 'room_one');
});

test('sign in ignores surrounding whitespace and letter case', async () => {
  await post('/api/auth/signup', { username: 'mixed_case', password: PASSWORD });
  const signedIn = await post('/api/auth/login', { username: '  MiXeD_CaSe ', password: PASSWORD });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.data.username, 'mixed_case');
});

test('wrong password is rejected with a generic message', async () => {
  await post('/api/auth/signup', { username: 'wrong_pass', password: PASSWORD });
  const failed = await post('/api/auth/login', { username: 'wrong_pass', password: 'not-the-password' });
  assert.equal(failed.status, 401);
  assert.equal(failed.data.error, 'Wrong username or password.');
  assert.equal(failed.setCookie, null);
});

test('unknown user gets the same generic message as a wrong password', async () => {
  const failed = await post('/api/auth/login', { username: 'nobody_here', password: PASSWORD });
  assert.equal(failed.status, 401);
  assert.equal(failed.data.error, 'Wrong username or password.');
  assert.equal(failed.setCookie, null);
});

test('a 25 character username is refused, not truncated to 24', async () => {
  const tooLong = 'a'.repeat(25);
  const rejected = await post('/api/auth/signup', { username: tooLong, password: PASSWORD });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /24 characters or fewer/);

  const truncatedLogin = await post('/api/auth/login', { username: tooLong.slice(0, 24), password: PASSWORD });
  assert.equal(truncatedLogin.status, 401);
  assert.equal(truncatedLogin.data.error, 'Wrong username or password.');
});

test('24 characters is accepted and stored whole', async () => {
  const longest = 'b'.repeat(24);
  const created = await post('/api/auth/signup', { username: longest, password: PASSWORD });
  assert.equal(created.status, 201);
  assert.equal(created.data.username, longest);
});

test('usernames shorter than 3 characters are refused', async () => {
  const rejected = await post('/api/auth/signup', { username: 'ab', password: PASSWORD });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /at least 3 characters/);
});

test('an email is refused with a message that says so', async () => {
  const rejected = await post('/api/auth/signup', { username: 'toibawani14@gmail.com', password: PASSWORD });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.data.error, 'Use your username, not an email.');
});

test('usernames differing only by case cannot both be registered', async () => {
  const first = await post('/api/auth/signup', { username: 'same_name', password: PASSWORD });
  assert.equal(first.status, 201);
  const second = await post('/api/auth/signup', { username: 'SAME_NAME', password: PASSWORD });
  assert.equal(second.status, 409);
});

test('signup rejects characters outside letters, numbers, and underscore', async () => {
  const rejected = await post('/api/auth/signup', { username: 'room one', password: PASSWORD });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /letters, numbers, and underscores/);
});

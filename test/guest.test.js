// test/guest.test.js
// Guest play is browser-only. The one moment guest data reaches the server is
// the carry-over after sign up, and that request is re-checked here: chapter
// one rooms only, plausible times only, never worse than what the account has.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-guest-test-'));
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

async function newAccount(username, password = 'theroomisclosing') {
  const res = await post('/api/auth/signup', { username, password });
  assert.equal(res.status, 201, `signup for ${username} should succeed`);
  return res.setCookie.split(';')[0];
}

test('a new account needs a password of 10 characters or more', async () => {
  const short = await post('/api/auth/signup', { username: 'short_pass', password: 'ninechars' });
  assert.equal(short.status, 400);
  assert.match(short.data.error, /at least 10 characters/);

  const ok = await post('/api/auth/signup', { username: 'long_enough', password: 'tencharsok' });
  assert.equal(ok.status, 201);
});

test('chapter one best times carry over to a new account', async () => {
  const cookie = await newAccount('carry_player');
  const imported = await post('/api/progress/import-guest', { bestTimes: { 1: 12.4, 2: 18.1 } }, cookie);
  assert.equal(imported.status, 200);

  const progress = await get('/api/progress', cookie);
  assert.equal(progress.status, 200);
  assert.equal(progress.data.bestTimes['1'], 12.4);
  assert.equal(progress.data.bestTimes['2'], 18.1);
  // Clearing both chapter one rooms opens chapter two.
  assert.equal(progress.data.unlockedLevel, 3);
});

test('a guest save cannot unlock rooms outside chapter one', async () => {
  const cookie = await newAccount('cheating_guest');
  const imported = await post('/api/progress/import-guest', { bestTimes: { 1: 12.4, 9: 9.9 } }, cookie);
  assert.equal(imported.status, 400);
  assert.match(imported.data.error, /chapter one/);

  const progress = await get('/api/progress', cookie);
  assert.deepEqual(progress.data.bestTimes, {});
  assert.equal(progress.data.unlockedLevel, 1);
});

test('a guest save cannot invent times or smuggle extra fields', async () => {
  const cookie = await newAccount('sloppy_guest');

  const tooFast = await post('/api/progress/import-guest', { bestTimes: { 1: 0.01 } }, cookie);
  assert.equal(tooFast.status, 400);

  const absurd = await post('/api/progress/import-guest', { bestTimes: { 1: 99999 } }, cookie);
  assert.equal(absurd.status, 400);

  const extra = await post('/api/progress/import-guest', { bestTimes: { 1: 12 }, unlockedLevel: 12 }, cookie);
  assert.equal(extra.status, 400);

  const progress = await get('/api/progress', cookie);
  assert.deepEqual(progress.data.bestTimes, {});
  assert.equal(progress.data.unlockedLevel, 1);
});

test('carrying over never makes an existing best time worse', async () => {
  const cookie = await newAccount('keeps_best');
  await post('/api/progress/import-guest', { bestTimes: { 1: 9.5 } }, cookie);
  const second = await post('/api/progress/import-guest', { bestTimes: { 1: 15.2 } }, cookie);
  assert.equal(second.status, 200);

  const progress = await get('/api/progress', cookie);
  assert.equal(progress.data.bestTimes['1'], 9.5);
});

test('guest carry-over requires a session', async () => {
  const res = await post('/api/progress/import-guest', { bestTimes: { 1: 12.4 } });
  assert.equal(res.status, 401);
});

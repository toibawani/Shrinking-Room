// scripts/verify-login.mjs
// Drives the real sign-in and create-account forms in Chromium and checks the
// rules phase 1 asked for. Screenshots land in docs/media/.
// Usage: node scripts/verify-login.mjs   (server must be on http://localhost:3000)

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MEDIA = path.join(process.cwd(), 'docs', 'media');
await mkdir(MEDIA, { recursive: true });

const EMAIL = 'toibawani14@gmail.com';
const password = 'theroomisclosing';
const stamp = Date.now().toString(36).slice(-4);
const longName = `verify_player_${stamp}`; // longer than the old 16 character cap
const browser = await chromium.launch();
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function openPage(width = 1440, height = 900, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => { if (r.url().includes('/api/auth/')) requests.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { context, page, requests };
}

// 1. Create an account through the form with a name longer than 16 characters.
{
  const { context, page } = await openPage();
  await page.getByRole('tab', { name: /sign up/i }).click();
  const user = page.locator('#signup-username');
  await user.pressSequentially(longName, { delay: 8 });
  check('signup field holds the whole username', (await user.inputValue()) === longName, `${longName.length} characters`);
  check('username input has no maxlength', (await user.getAttribute('maxlength')) === null);
  await page.locator('#signup-password').fill(password);
  await page.locator('#signup-confirm').fill(password);
  await page.locator('#btn-signup').click();
  await page.waitForSelector('#screen-intro.active, #screen-menu.active', { timeout: 5000 });
  const stored = await page.evaluate(async () => (await fetch('/api/auth/me')).json());
  check('created account is signed in', stored.username === longName, JSON.stringify(stored));
  await page.screenshot({ path: path.join(MEDIA, 'phase1-after-signup-1440.png') });
  await context.close();
}

// 2. Sign in with different case and stray spaces.
{
  const { context, page } = await openPage();
  const user = page.locator('#signin-username');
  await user.pressSequentially(`  ${longName.toUpperCase()}  `, { delay: 5 });
  await page.locator('#signin-password').fill(password);
  await page.locator('#btn-signin').click();
  await page.waitForSelector('#screen-intro.active, #screen-menu.active', { timeout: 5000 });
  const stored = await page.evaluate(async () => (await fetch('/api/auth/me')).json());
  check('case and whitespace insensitive sign in', stored.username === longName, JSON.stringify(stored));
  await context.close();
}

// 3. Wrong password and unknown user get the same message.
for (const [label, name, pass] of [
  ['wrong password', longName, 'not-the-password'],
  ['unknown user', `nobody_${stamp}`, password],
]) {
  const { context, page } = await openPage();
  await page.locator('#signin-username').pressSequentially(name, { delay: 5 });
  await page.locator('#signin-password').fill(pass);
  await page.locator('#btn-signin').click();
  await page.waitForFunction(() => document.getElementById('signin-error').textContent.trim().length > 0);
  const message = (await page.locator('#signin-error').textContent()).trim();
  check(`${label} is refused generically`, message === 'Wrong username or password.', message);
  await context.close();
}

// 4. An @ in the username is called out at once, before submit.
{
  const { context, page } = await openPage();
  await page.getByRole('tab', { name: /sign up/i }).click();
  const user = page.locator('#signup-username');
  await user.pressSequentially(EMAIL, { delay: 10 });
  await page.waitForFunction(() => document.getElementById('signup-error').textContent.trim().length > 0);
  const message = (await page.locator('#signup-error').textContent()).trim();
  check('email shows the username-not-email message immediately', message === 'Use your username, not an email.', message);
  check('email is left in the field, not truncated', (await user.inputValue()) === EMAIL);
  await page.screenshot({ path: path.join(MEDIA, 'phase1-after-email-message-1440.png') });
  await context.close();
}

// 5. A 30 character name is refused with a message and never sent.
{
  const { context, page, requests } = await openPage();
  await page.getByRole('tab', { name: /sign up/i }).click();
  const typed = 'a'.repeat(30);
  await page.locator('#signup-username').pressSequentially(typed, { delay: 5 });
  check('30 characters stay in the field', (await page.locator('#signup-username').inputValue()) === typed);
  await page.locator('#signup-password').fill(password);
  await page.locator('#signup-confirm').fill(password);
  await page.locator('#btn-signup').click();
  await page.waitForFunction(() => document.getElementById('signup-error').textContent.trim().length > 0);
  const message = (await page.locator('#signup-error').textContent()).trim();
  check('long username is refused inline', /at most 24 characters/.test(message), message);
  check('long username never reaches the server', !requests.includes('POST /api/auth/signup'), requests.join(', '));
  await context.close();
}

// 6. Narrow viewport, real typing, one screenshot of each form.
{
  const { context, page } = await openPage(375, 812);
  await page.locator('#signin-username').pressSequentially(longName, { delay: 5 });
  await page.locator('#signin-password').fill(password);
  await page.locator('#btn-signin').click();
  await page.waitForSelector('#screen-intro.active, #screen-menu.active', { timeout: 5000 });
  await page.screenshot({ path: path.join(MEDIA, 'phase1-after-signin-375.png'), fullPage: true });
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;

// scripts/repro-login.mjs
// Reproduces the sign-in failure in a real browser and writes screenshots.
// Usage: node scripts/repro-login.mjs [label]
// Requires the server on http://localhost:3000.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const LABEL = process.argv[2] || 'before';
const MEDIA = path.join(process.cwd(), 'docs', 'media');
const EMAIL_AS_USERNAME = 'toibawani14@gmail.com';

await mkdir(MEDIA, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

await page.goto(BASE, { waitUntil: 'networkidle' });

// Sign up form: type an email as a human would, one key at a time, so the
// browser applies every constraint it would apply to a real player.
await page.getByRole('tab', { name: /sign up/i }).click();
const signupUser = page.locator('#signup-username');
await signupUser.click();
await signupUser.pressSequentially(EMAIL_AS_USERNAME, { delay: 15 });

const typed = await signupUser.inputValue();
const maxlength = await signupUser.getAttribute('maxlength');
const pattern = await signupUser.getAttribute('pattern');
console.log('typed       :', JSON.stringify(EMAIL_AS_USERNAME), `(${EMAIL_AS_USERNAME.length} chars)`);
console.log('in the field:', JSON.stringify(typed), `(${typed.length} chars)`);
console.log('maxlength attr:', maxlength, '| pattern attr:', pattern);
console.log('truncated   :', typed !== EMAIL_AS_USERNAME);

await page.locator('#signup-password').fill('roomisclosing');
await page.locator('#signup-confirm').fill('roomisclosing');
await page.locator('#btn-signup').click();
await page.waitForTimeout(600);
const signupError = (await page.locator('#signup-error').textContent()).trim();
console.log('signup error:', JSON.stringify(signupError));
await page.screenshot({ path: path.join(MEDIA, `phase1-${LABEL}-signup-1440.png`) });

// Sign in with the same email, plus a known-good username with a wrong
// password, to see which message the server returns for each.
await page.getByRole('tab', { name: /sign in/i }).click();
const signinUser = page.locator('#signin-username');
await signinUser.click();
await signinUser.pressSequentially(EMAIL_AS_USERNAME, { delay: 15 });
const signinTyped = await signinUser.inputValue();
console.log('signin field:', JSON.stringify(signinTyped), `(${signinTyped.length} chars)`);
await page.locator('#signin-password').fill('roomisclosing');
await page.locator('#btn-signin').click();
await page.waitForTimeout(600);
console.log('signin error (unknown/truncated user):', JSON.stringify((await page.locator('#signin-error').textContent()).trim()));
await page.screenshot({ path: path.join(MEDIA, `phase1-${LABEL}-signin-1440.png`) });

// Known account, wrong password. Proves the message is generic.
await signinUser.fill('testplayer');
await page.locator('#signin-password').fill('definitely-not-the-password');
await page.locator('#btn-signin').click();
await page.waitForTimeout(600);
console.log('signin error (known user, wrong password):', JSON.stringify((await page.locator('#signin-error').textContent()).trim()));

// Narrow viewport, same flow up to the error.
await page.setViewportSize({ width: 375, height: 812 });
await page.screenshot({ path: path.join(MEDIA, `phase1-${LABEL}-signin-375.png`) });

console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');
await browser.close();

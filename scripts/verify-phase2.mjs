// scripts/verify-phase2.mjs
// Drives the rebuilt auth screen in Chromium: tokens, type, shapes, the room
// panel's tighten reaction, guest play, and the guest save carry-over.
// Usage: BASE_URL=http://localhost:3101 node scripts/verify-phase2.mjs

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MEDIA = path.join(process.cwd(), 'docs', 'media');
await mkdir(MEDIA, { recursive: true });

const PASSWORD = 'theroomisclosing';
const stamp = Date.now().toString(36).slice(-5);
const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();

async function newPage(width = 1440, height = 900, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await context.newPage();
  const external = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { context, page, external };
}

// Audits every visible element for the things phase 2 bans.
async function audit(page, label) {
  const report = await page.evaluate(() => {
    const problems = [];
    const parsed = [];
    document.querySelectorAll('*').forEach((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) return;
      parsed.push({ style, tag: el.tagName, cls: el.className });
    });
    const violet = (rgb) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
      if (!m) return false;
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (r + g + b < 30) return false;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max - min < 12) return false;
      let h;
      if (max === r) h = ((g - b) / (max - min)) * 60;
      else if (max === g) h = (2 + (b - r) / (max - min)) * 60;
      else h = (4 + (r - g) / (max - min)) * 60;
      if (h < 0) h += 360;
      return h >= 235 && h <= 305;
    };
    parsed.forEach(({ style, tag, cls }) => {
      if (/gradient/.test(style.backgroundImage)) problems.push(`${tag}.${cls}: gradient background`);
      if (style.boxShadow !== 'none') problems.push(`${tag}.${cls}: box shadow`);
      if (/^rgba?\(255,\s*255,\s*255/.test(style.backgroundColor)) problems.push(`${tag}.${cls}: pure white background`);
      if (violet(style.backgroundColor)) problems.push(`${tag}.${cls}: violet background ${style.backgroundColor}`);
      if (violet(style.color)) problems.push(`${tag}.${cls}: violet text ${style.color}`);
      const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius];
      radii.forEach((radius) => {
        if (!/^\d/.test(radius)) return;
        const px = parseFloat(radius);
        const isCircle = tag === 'CANVAS' || /rl-ring|shape-circle/.test(cls || '');
        if (px > 2 && !isCircle) problems.push(`${tag}.${cls}: radius ${radius}`);
      });
    });
    return { problems, body: getComputedStyle(document.body).backgroundColor };
  });
  check(`${label}: no gradients, shadows, white or violet surfaces`, report.problems.length === 0, report.problems.slice(0, 6).join('; '));
  return report;
}

// 1. Landing screen: type, tokens, fonts, skeleton, tabs.
{
  const { context, page, external } = await newPage();
  check('no third-party requests (fonts are self-hosted)', external.length === 0, external.join(', '));

  const report = await audit(page, 'auth screen');
  check('page is bone', report.body === 'rgb(231, 226, 214)', report.body);

  const type = await page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return {
      title: style('.auth-title').fontFamily,
      body: style('body').fontFamily,
      titleWeight: style('.auth-title').fontWeight,
      caption: style('.room-caption').fontFamily,
      tabsHiddenAfterLoad: document.getElementById('auth-tabs').hidden,
      skeletonHidden: document.getElementById('auth-skeleton').hidden,
      formVisible: !document.getElementById('panel-signin').hidden,
      signinTabRadius: style('#tab-signin').borderRadius,
      signinTabBg: style('#tab-signin').backgroundColor,
      inputBg: style('#signin-username').backgroundColor,
      inputRadius: style('#signin-username').borderRadius,
      panelRadius: style('#auth-panel').borderRadius,
      btnRadius: style('#btn-signin').borderRadius,
      btnBg: style('#btn-signin').backgroundColor,
      btnColor: style('#btn-signin').color,
      tabUnderline: style('#tab-signin').borderBottomWidth,
    };
  });
  check('title uses Big Shoulders Display 800', /Big Shoulders Display/.test(type.title) && type.titleWeight === '800', `${type.title} ${type.titleWeight}`);
  check('body uses IBM Plex Sans', /IBM Plex Sans/.test(type.body), type.body);
  check('numbers use JetBrains Mono', /JetBrains Mono/.test(type.caption), type.caption);
  check('session skeleton resolves into the form', type.skeletonHidden && type.formVisible && !type.tabsHiddenAfterLoad);
  check('tabs are plain text with an underline', type.signinTabRadius === '0px' && type.signinTabBg === 'rgba(0, 0, 0, 0)' && type.tabUnderline === '2px', `${type.signinTabRadius} ${type.signinTabBg} ${type.tabUnderline}`);
  check('panel has square corners', type.panelRadius === '0px', type.panelRadius);
  check('buttons and inputs use 2px radius', type.btnRadius === '2px' && type.inputRadius === '2px');
  check('inputs sit on the field tone', type.inputBg === 'rgb(243, 239, 230)', type.inputBg);
  check('primary button is ink fill with bone text', type.btnBg === 'rgb(22, 21, 15)' && type.btnColor === 'rgb(231, 226, 214)', `${type.btnBg} / ${type.btnColor}`);

  const labels = await page.evaluate(() => ({
    signinPlaceholder: document.getElementById('signin-username').getAttribute('placeholder'),
    labelText: document.querySelector('label[for="signin-username"]').textContent.trim(),
    hint: document.getElementById('signup-password-hint').textContent.trim(),
    noMaxLength: document.getElementById('signup-username').getAttribute('maxlength') === null,
    footerLinks: Array.from(document.querySelectorAll('.site-footer a')).map((a) => a.textContent.trim()),
  }));
  check('labels sit above inputs, no placeholder-as-label', labels.labelText === 'Username' && labels.signinPlaceholder === null, `${labels.labelText} / ${labels.signinPlaceholder}`);
  check('create account states the 10 character minimum', labels.hint === '10 characters or more.', labels.hint);
  check('username still has no maxlength', labels.noMaxLength);
  check('footer links to both policies', labels.footerLinks.length === 2, labels.footerLinks.join(', '));

  await page.getByRole('tab', { name: 'Create account' }).click();
  const toggled = await page.evaluate(() => {
    const input = document.getElementById('signup-password');
    const before = input.type;
    document.querySelector('[data-toggle-password="signup-password"]').click();
    const after = input.type;
    document.querySelector('[data-toggle-password="signup-password"]').click();
    return { before, after, back: input.type };
  });
  check('show password is a plain text toggle', toggled.before === 'password' && toggled.after === 'text' && toggled.back === 'password');
  await page.screenshot({ path: path.join(MEDIA, 'phase2-auth-signup-1440.png') });

  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.screenshot({ path: path.join(MEDIA, 'phase2-auth-1440.png'), fullPage: true });
  await context.close();
}

// 2. Failed sign-in tightens the room, then eases back.
{
  const { context, page } = await newPage();
  await page.locator('#signin-username').fill(`nobody_${stamp}`);
  await page.locator('#signin-password').fill('wrong-password');
  await page.locator('#btn-signin').click();
  await page.waitForFunction(() => document.getElementById('signin-error').textContent.trim().length > 0);
  await page.waitForTimeout(150); // the tighten is a 120ms hard step
  const during = await page.evaluate(() => ({
    padding: getComputedStyle(document.getElementById('auth-panel')).paddingTop,
    tighten: document.getElementById('auth-panel').classList.contains('room-tighten'),
  }));
  check('failed sign-in applies the room tighten state', during.tighten);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => getComputedStyle(document.getElementById('auth-panel')).paddingTop);
  check('failed sign-in tightens the panel by 8px', during.padding === '24px', during.padding);
  check('the panel eases back to its margin', after === '32px', after);
  const message = (await page.locator('#signin-error').textContent()).trim();
  check('sign-in failure stays generic', message === 'Wrong username or password.', message);
  await page.screenshot({ path: path.join(MEDIA, 'phase2-auth-failed-1440.png') });
  await context.close();
}

// 3. Reduced motion: the panel flashes signal instead of moving.
{
  const { context, page } = await newPage(1440, 900, 'reduce');
  await page.locator('#signin-username').fill(`nobody_${stamp}`);
  await page.locator('#signin-password').fill('wrong-password');
  await page.locator('#btn-signin').click();
  await page.waitForFunction(() => document.getElementById('auth-panel').classList.contains('room-tighten'));
  const state = await page.evaluate(() => {
    const style = getComputedStyle(document.getElementById('auth-panel'));
    return { padding: style.paddingTop, border: style.borderTopColor };
  });
  check('reduced motion keeps the margin and flashes the border', state.padding === '32px' && state.border === 'rgb(184, 38, 15)', `${state.padding} / ${state.border}`);
  const stillAnimating = await page.evaluate(() => {
    const canvas = document.getElementById('auth-room-canvas');
    const first = canvas.toDataURL().length;
    return new Promise((resolve) => setTimeout(() => resolve(canvas.toDataURL().length === first), 400));
  });
  check('reduced motion shows a static room frame', stillAnimating);
  await context.close();
}

// 4. Guest play: chapter one only, progress in localStorage.
{
  const { context, page } = await newPage();
  const progressCalls = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/progress')) progressCalls.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await page.locator('#btn-guest').click();
  await page.waitForSelector('#screen-intro.active', { timeout: 3000 });
  check('guest mode starts at the title screen', true);
  await page.locator('#btn-enter-game').click();
  await page.locator('#btn-skip-tutorial').click();
  await page.waitForSelector('#screen-game.active', { timeout: 3000 });
  await page.waitForTimeout(250);
  const puzzle = await page.evaluate(() => {
    const tile = document.querySelector('#puzzle-layer .pc-tile');
    const layer = document.getElementById('puzzle-layer');
    return {
      tile: tile ? Math.round(tile.getBoundingClientRect().width) : 0,
      layer: Math.round(layer.getBoundingClientRect().width),
    };
  });
  check('the puzzle fills the room instead of collapsing', puzzle.tile >= 40 && puzzle.layer > 300, `tile ${puzzle.tile}px in a ${puzzle.layer}px room`);
  await audit(page, 'game screen');
  await page.screenshot({ path: path.join(MEDIA, 'phase2-game-1440.png') });
  const guestState = await page.evaluate(() => ({ save: localStorage.getItem('sr_guest_progress_v1') }));
  check('guest progress is written to localStorage', !!guestState.save, guestState.save ? 'key present' : 'missing');
  check('guest play never calls the progress API', progressCalls.length === 0, progressCalls.join(', '));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#screen-pause.active');
  await page.locator('#btn-menu-from-pause').click();
  await page.locator('#btn-level-select').click();
  const rooms = await page.evaluate(() => Array.from(document.querySelectorAll('.level-card')).map((card) => ({
    locked: card.disabled,
    label: card.textContent.replace(/\s+/g, ' ').trim(),
  })));
  const lockedCount = rooms.filter((room) => room.locked).length;
  const accountRequired = rooms.filter((room) => room.locked && /Account required/.test(room.label)).length;
  // A fresh guest has cleared nothing, so room 1 is open and room 2 waits on it.
  // Every room past chapter one asks for an account instead.
  check('guests see chapter one only, the rest requiring an account', rooms.length === 12 && lockedCount === 11 && accountRequired === 10, `${lockedCount} locked, ${accountRequired} say account required`);
  await page.screenshot({ path: path.join(MEDIA, 'phase2-rooms-guest-1440.png'), fullPage: true });
  await page.locator('#btn-back-from-levels').click();

  const menuRoom = await page.evaluate(async () => {
    const canvas = document.getElementById('menu-room-canvas');
    if (!canvas || !canvas.width) return { painted: false, animated: false };
    const first = canvas.toDataURL();
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { painted: true, animated: canvas.toDataURL() !== first, caption: document.getElementById('menu-room-caption').textContent.trim() };
  });
  check('the menu shows the live room and the next room number', menuRoom.painted && menuRoom.animated && /Room 0[12]/.test(menuRoom.caption || ''), JSON.stringify(menuRoom));
  await page.screenshot({ path: path.join(MEDIA, 'phase2-menu-guest-1440.png'), fullPage: true });
  await context.close();
}

// 5. Guest save carries over after sign up, and the server accepts chapter one only.
{
  const username = `carry_${stamp}`;
  const { context, page } = await newPage();
  await page.evaluate(() => {
    localStorage.setItem('sr_guest_progress_v1', JSON.stringify({
      bestTimes: { 1: 12.4, 2: 18.1, 7: 3.2 },
      hasSeenIntro: true,
      hasSeenTutorial: true,
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  const guestLabel = (await page.locator('#btn-guest').textContent()).trim();
  check('a returning guest is offered their save', /Continue chapter one as a guest/.test(guestLabel), guestLabel);

  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.locator('#signup-username').fill(username);
  await page.locator('#signup-password').fill(PASSWORD);
  await page.locator('#signup-confirm').fill(PASSWORD);
  await page.locator('#btn-signup').click();
  await page.waitForSelector('#screen-carry.active', { timeout: 5000 });
  await page.screenshot({ path: path.join(MEDIA, 'phase2-carry-over-1440.png') });
  await page.locator('#btn-carry-yes').click();
  await page.waitForSelector('#screen-intro.active, #screen-menu.active', { timeout: 5000 });

  const result = await page.evaluate(async () => {
    const progress = await (await fetch('/api/progress')).json();
    return { progress, guestSave: localStorage.getItem('sr_guest_progress_v1') };
  });
  check('carry-over stores chapter one best times', result.progress.bestTimes['1'] === 12.4 && result.progress.bestTimes['2'] === 18.1, JSON.stringify(result.progress.bestTimes));
  check('carry-over never imports rooms outside chapter one', result.progress.bestTimes['7'] === undefined, JSON.stringify(result.progress.bestTimes));
  check('carry-over opens chapter two', result.progress.unlockedLevel === 3, String(result.progress.unlockedLevel));
  check('the local guest save is cleared after carrying', result.guestSave === null);
  await context.close();
}

// 6. Narrow viewport screenshots.
{
  const { context, page } = await newPage(375, 812);
  await page.screenshot({ path: path.join(MEDIA, 'phase2-auth-375.png'), fullPage: true });
  await audit(page, 'auth screen at 375');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check('no horizontal overflow at 375px', overflow);
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.screenshot({ path: path.join(MEDIA, 'phase2-auth-signup-375.png'), fullPage: true });
  await context.close();
}

// 7. Narrow game screen keeps the room and HUD on screen.
{
  const { context, page } = await newPage(375, 812);
  await page.evaluate(() => localStorage.setItem('sr_guest_progress_v1', JSON.stringify({ bestTimes: {}, hasSeenIntro: true, hasSeenTutorial: true })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#btn-guest').click();
  await page.locator('#btn-play').click();
  await page.waitForSelector('#screen-game.active');
  await page.waitForTimeout(250);
  const small = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth <= window.innerWidth,
    frame: Math.round(document.getElementById('stage-frame').getBoundingClientRect().width),
    tile: Math.round(document.querySelector('#puzzle-layer .pc-tile').getBoundingClientRect().width),
  }));
  check('the game fits a 375px screen', small.overflow && small.frame <= 375 && small.tile >= 30, JSON.stringify(small));
  await page.screenshot({ path: path.join(MEDIA, 'phase2-game-375.png'), fullPage: true });
  await context.close();
}

// 8. Policy pages are on the same system.
{
  const { context, page } = await newPage();
  await page.locator('.site-footer a', { hasText: 'Privacy Policy' }).click();
  await page.waitForLoadState('networkidle');
  const privacy = await page.evaluate(() => ({
    title: document.querySelector('h1').textContent.trim(),
    font: getComputedStyle(document.querySelector('h1')).fontFamily,
    body: getComputedStyle(document.body).backgroundColor,
    footer: !!document.querySelector('.site-footer'),
  }));
  audit(page, 'privacy page');
  check('privacy page uses the same system', privacy.title === 'Privacy Policy' && /Big Shoulders/.test(privacy.font) && privacy.body === 'rgb(231, 226, 214)' && privacy.footer, JSON.stringify(privacy));
  await page.screenshot({ path: path.join(MEDIA, 'phase2-privacy-1440.png'), fullPage: true });
  await page.locator('.site-footer a', { hasText: 'Terms of Service' }).click();
  await page.waitForLoadState('networkidle');
  const terms = await page.evaluate(() => document.querySelector('h1').textContent.trim());
  check('terms page loads in the same system', terms === 'Terms of Service', terms);
  await page.screenshot({ path: path.join(MEDIA, 'phase2-terms-1440.png'), fullPage: true });
  await context.close();
}

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;

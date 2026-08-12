// game.js
// Core loop: auth, screen navigation, and the shrinking-room timer/canvas
// mechanic. Progress now lives server-side (see src/progress.js) instead
// of localStorage — persisted() below is just an in-memory cache of what
// the server told us, kept in sync with PUT /api/progress.

const DIFFICULTY_MULTIPLIERS = { easy: 1.35, normal: 1.0, hard: 0.72 };
const THEME_UNLOCK_COMBOS = { cyan: 3, violet: 6, emerald: 9 };
const TUTORIAL_STEPS = [
  { title: 'The room is shrinking.', body: 'The walls close in on a timer. Solve the puzzle inside before they reach you.' },
  { title: 'Every room, a new puzzle.', body: 'Memory, locks, hidden objects, patterns, wires, weights. Check the line below the room if you need a nudge.' },
  { title: 'Speed builds your streak.', body: 'Clear a room with time to spare and your streak grows. Streaks unlock new room themes.' },
  { title: 'Esc pauses. Retry is instant.', body: 'No loading screens. If the walls get you, you are back in within a second.' },
];

const GameState = {
  baseScreen: 'screen-landing',
  username: null,
  currentLevelIndex: 0,
  puzzleIndexInLevel: 0,
  combo: 0,
  isPaused: false,
  tutorialStep: 0,
  tutorialFromLanding: false,
  particles: [],
  shake: null,
  elapsed: 0,
  currentNotch: 0,
  displayedRoomSize: 520,
  targetRoomSize: 520,
  isWarning: false,
  isPlaying: false,
  lastTimestamp: 0,
};

function $(id) { return document.getElementById(id); }

function defaultPersisted() {
  return { bestTimes: {}, unlockedLevel: 1, unlockedThemes: ['amber'], currentTheme: 'amber', hasSeenTutorial: false, soundOn: true, difficulty: 'normal', stats: { puzzlesSolved: 0, roomsCleared: 0, bestStreak: 0 } };
}
let persisted = defaultPersisted();

async function apiFetch(url, options) {
  const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body is fine */ }
  return { ok: res.ok, status: res.status, data };
}

async function fetchMe() {
  const { ok, data } = await apiFetch('/api/auth/me');
  return ok ? data.username : null;
}
async function fetchProgress() {
  const { ok, data } = await apiFetch('/api/progress');
  return ok ? data : defaultPersisted();
}
async function savePersisted() {
  try { await apiFetch('/api/progress', { method: 'PUT', body: JSON.stringify(persisted) }); }
  catch (e) { console.warn('Could not save progress to the server:', e); }
}
async function signUp(username, password) {
  return apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ username, password }) });
}
async function signIn(username, password) {
  return apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}
async function logOut() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  GameState.username = null;
  persisted = defaultPersisted();
  switchBaseScreen('screen-landing');
}

function renderThemeSwatches() {
  const wrap = $('theme-swatches');
  wrap.innerHTML = '';
  ['amber', 'cyan', 'violet', 'emerald'].forEach(theme => {
    const unlocked = persisted.unlockedThemes.includes(theme);
    const swatch = document.createElement('button');
    swatch.className = 'theme-swatch theme-' + theme + (unlocked ? '' : ' locked');
    swatch.disabled = !unlocked;
    if (unlocked) {
      swatch.addEventListener('click', () => {
        persisted.currentTheme = theme;
        document.body.dataset.theme = theme;
        savePersisted();
        renderThemeSwatches();
      });
    }
    wrap.appendChild(swatch);
  });
}
function formatTime(s) { return Math.max(0, s).toFixed(1); }
function getCurrentLevelData() { return LEVELS[GameState.currentLevelIndex]; }
function getEffectiveTimeLimit(level) { return level.timeLimit * (DIFFICULTY_MULTIPLIERS[persisted.difficulty] || 1); }

function switchBaseScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { if (!s.classList.contains('overlay')) s.classList.remove('active'); });
  $(id).classList.add('active');
  GameState.baseScreen = id;
}
function showOverlay(id) { $(id).classList.add('active'); }
function hideOverlay(id) { $(id).classList.remove('active'); }

const LEVEL_COLORS = ['#ff3d81', '#35e6c8', '#ffe14d', '#7c5cff', '#ff7a3d', '#4dd8ff', '#a3ff5c', '#ff5c8a', '#5cffe0', '#ffcf5c', '#c15cff', '#5cff8f'];
function levelColor(levelId) { return LEVEL_COLORS[(levelId - 1) % LEVEL_COLORS.length]; }

function renderLevelGrid() {
  const streakEl = $('level-select-streak');
  if (GameState.combo > 0) streakEl.textContent = `Current streak: ${GameState.combo}`;
  else if (persisted.stats.bestStreak > 0) streakEl.textContent = `Best streak: ${persisted.stats.bestStreak}`;
  else streakEl.textContent = 'Clear a room fast to start a streak';

  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const card = document.createElement('button');
    const locked = level.id > persisted.unlockedLevel;
    card.className = 'level-card' + (locked ? ' locked' : '');
    card.disabled = locked;
    if (!locked) card.style.setProperty('--level-color', levelColor(level.id));
    const best = persisted.bestTimes[level.id];
    const prevName = i > 0 ? LEVELS[i - 1].name : '';
    card.innerHTML = locked
      ? `<span class="level-num">${level.id}</span><span class="level-name">Clear "${prevName}"</span>`
      : `<span class="level-num">${level.id}</span><span class="level-name">${level.name}</span><span class="level-best">${best !== undefined ? best.toFixed(1) + 's best' : 'Not cleared'}</span>`;
    if (!locked) card.addEventListener('click', () => { SFX.click(); startLevel(i); });
    grid.appendChild(card);
  });
}

function bindEvents() {
  $('btn-play').addEventListener('click', () => {
    const idx = Math.max(0, Math.min(persisted.unlockedLevel - 1, LEVELS.length - 1));
    startLevel(idx);
  });
  $('btn-level-select').addEventListener('click', () => { renderLevelGrid(); switchBaseScreen('screen-level-select'); });
  $('btn-settings').addEventListener('click', () => { renderThemeSwatches(); syncDifficultyButtons(); syncSoundButtons(); switchBaseScreen('screen-settings'); });
  $('btn-back-from-levels').addEventListener('click', () => switchBaseScreen('screen-menu'));
  $('btn-back-from-settings').addEventListener('click', () => switchBaseScreen('screen-menu'));

  $('btn-pause').addEventListener('click', () => { GameState.isPaused = true; SFX.setMuted(true); showOverlay('screen-pause'); });
  $('btn-resume').addEventListener('click', () => { GameState.isPaused = false; SFX.setMuted(!persisted.soundOn); hideOverlay('screen-pause'); });
  $('btn-restart-from-pause').addEventListener('click', () => { GameState.isPaused = false; SFX.setMuted(!persisted.soundOn); hideOverlay('screen-pause'); startLevel(GameState.currentLevelIndex); });
  $('btn-menu-from-pause').addEventListener('click', () => { GameState.isPaused = false; SFX.setMuted(!persisted.soundOn); SFX.stopBackground(); hideOverlay('screen-pause'); switchBaseScreen('screen-menu'); });
  $('btn-retry').addEventListener('click', () => { hideOverlay('screen-game-over'); startLevel(GameState.currentLevelIndex); });
  $('btn-menu-from-gameover').addEventListener('click', () => { hideOverlay('screen-game-over'); switchBaseScreen('screen-menu'); });
  $('btn-next-level').addEventListener('click', () => { hideOverlay('screen-level-complete'); startLevel(Math.min(GameState.currentLevelIndex + 1, LEVELS.length - 1)); });
  $('btn-menu-from-complete').addEventListener('click', () => { hideOverlay('screen-level-complete'); switchBaseScreen('screen-menu'); });

  $('tab-signin').addEventListener('click', () => switchAuthTab('signin'));
  $('tab-signup').addEventListener('click', () => switchAuthTab('signup'));

  $('panel-signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    SFX.unlock();
    const username = $('signin-username').value.trim();
    const password = $('signin-password').value;
    $('signin-error').textContent = '';
    const { ok, data } = await signIn(username, password);
    if (!ok) { $('signin-error').textContent = data.error || 'Something went wrong.'; return; }
    await afterAuthSuccess(data.username);
  });

  $('panel-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    SFX.unlock();
    const username = $('signup-username').value.trim();
    const password = $('signup-password').value;
    const confirm = $('signup-confirm').value;
    $('signup-error').textContent = '';
    if (password !== confirm) { $('signup-error').textContent = 'Passwords do not match.'; return; }
    const { ok, data } = await signUp(username, password);
    if (!ok) { $('signup-error').textContent = data.error || 'Something went wrong.'; return; }
    await afterAuthSuccess(data.username);
  });

  $('btn-how-to-play').addEventListener('click', () => openTutorial(false));
  $('btn-tutorial-next').addEventListener('click', () => advanceTutorial());
  $('btn-skip-tutorial').addEventListener('click', () => closeTutorial());
  $('btn-sound-toggle').addEventListener('click', () => setSound(!persisted.soundOn));
  document.querySelectorAll('.diff-btn[data-sound]').forEach(btn => {
    btn.addEventListener('click', () => setSound(btn.dataset.sound === 'on'));
  });
  document.querySelectorAll('.diff-btn[data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      persisted.difficulty = btn.dataset.difficulty;
      savePersisted();
      syncDifficultyButtons();
      SFX.click();
    });
  });
  $('btn-logout').addEventListener('click', () => logOut());
}

function startLevel(index) {
  GameState.currentLevelIndex = index;
  GameState.elapsed = 0;
  GameState.currentNotch = 0;
  const level = getCurrentLevelData();
  GameState.displayedRoomSize = level.initialRoomSize;
  GameState.targetRoomSize = level.initialRoomSize;
  $('hud-level').textContent = level.id;
  const best = persisted.bestTimes[level.id];
  $('hud-best').textContent = best !== undefined ? best.toFixed(1) + 's' : '--';
  switchBaseScreen('screen-game');
  GameState.isPlaying = true;
  SFX.startBackground();

  GameState.puzzleIndexInLevel = 0;
  mountCurrentPuzzle();
}

function mountCurrentPuzzle() {
  const level = getCurrentLevelData();
  const puzzleConfig = level.puzzles[GameState.puzzleIndexInLevel];
  const layer = $('puzzle-layer');
  Puzzles.create(puzzleConfig.type, puzzleConfig.params, layer, handlePuzzleSolved);
  const multiTag = level.puzzles.length > 1 ? ` (${GameState.puzzleIndexInLevel + 1}/${level.puzzles.length})` : '';
  $('stage-hint').textContent = Puzzles.hint(puzzleConfig.type) + multiTag;
}

function fireSolveFlash(color, big) {
  const flash = $('solve-flash');
  flash.style.setProperty('--flash-color', color);
  flash.classList.remove('firing');
  void flash.offsetWidth; // restart the animation even if it's still fading from a moment ago
  flash.classList.add('firing');
  const frame = $('stage-frame');
  frame.classList.remove('solved-kick');
  void frame.offsetWidth;
  frame.classList.add('solved-kick');
  spawnBurstParticles(300, 300, color, big ? 60 : 34);
}

function handlePuzzleSolved() {
  SFX.solved();
  const level = getCurrentLevelData();
  const isLastPuzzleInLevel = GameState.puzzleIndexInLevel + 1 >= level.puzzles.length;
  fireSolveFlash(getCSSVar('--success') || '#00f0c0', isLastPuzzleInLevel);
  GameState.puzzleIndexInLevel++;
  if (GameState.puzzleIndexInLevel < level.puzzles.length) {
    mountCurrentPuzzle();
  } else {
    handleLevelComplete();
  }
}

function handleLevelComplete() {
  GameState.isPlaying = false;
  SFX.stopBackground();
  SFX.levelComplete();
  const level = getCurrentLevelData();
  const timeTaken = GameState.elapsed;
  const prevBest = persisted.bestTimes[level.id];
  if (prevBest === undefined || timeTaken < prevBest) persisted.bestTimes[level.id] = timeTaken;

  const effectiveLimit = getEffectiveTimeLimit(level);
  if (timeTaken <= effectiveLimit * 0.6) GameState.combo++; else GameState.combo = 0;
  persisted.stats.roomsCleared++;
  persisted.stats.bestStreak = Math.max(persisted.stats.bestStreak, GameState.combo);

  Object.keys(THEME_UNLOCK_COMBOS).forEach(theme => {
    if (GameState.combo >= THEME_UNLOCK_COMBOS[theme] && !persisted.unlockedThemes.includes(theme)) {
      persisted.unlockedThemes.push(theme);
    }
  });
  savePersisted();

  $('complete-time').textContent = timeTaken.toFixed(1);
  $('complete-combo').textContent = GameState.combo;
  showOverlay('screen-level-complete');
}

function triggerWallShrink(notchIndex, level) {
  const shrinkPerNotch = (level.initialRoomSize - level.crushRoomSize) / level.shrinkNotches;
  GameState.targetRoomSize = Math.max(level.crushRoomSize, level.initialRoomSize - shrinkPerNotch * notchIndex);
  SFX.shrink();
  shakeScreen(300, 8);
}

function shakeScreen(duration, intensity) {
  GameState.shake = { duration, intensity, elapsed: 0, active: true };
}
function updateShakeState(dt) {
  const el = $('stage-shake');
  const s = GameState.shake;
  if (!s || !s.active) { el.style.transform = ''; return; }
  s.elapsed += dt * 1000;
  if (s.elapsed >= s.duration) { s.active = false; el.style.transform = ''; return; }
  const p = 1 - s.elapsed / s.duration;
  const dx = (Math.random() * 2 - 1) * s.intensity * p;
  const dy = (Math.random() * 2 - 1) * s.intensity * p;
  el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
}

function spawnBurstParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 220;
    GameState.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.5 + Math.random() * 0.4, age: 0, size: 2 + Math.random() * 3, color });
  }
}
function updateParticles(dt) {
  GameState.particles.forEach(p => { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; });
  GameState.particles = GameState.particles.filter(p => p.age < p.life);
}
function drawParticles(ctx) {
  GameState.particles.forEach(p => {
    const t = 1 - p.age / p.life;
    ctx.save();
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function updateGameplay(dt) {
  GameState.elapsed += dt;
  const level = getCurrentLevelData();
  const effectiveLimit = getEffectiveTimeLimit(level);
  const timeRemaining = effectiveLimit - GameState.elapsed;
  $('hud-timer').textContent = formatTime(timeRemaining);
  $('hud-timer').classList.toggle('critical', timeRemaining <= 5);

  // Check the notch trigger before the game-over check. The last notch's
  // trigger time and the time limit land on the same instant by
  // construction (notchInterval * shrinkNotches === effectiveLimit), so
  // whichever check ran first used to silently win - meaning the final
  // wall-shrink beat (shake + sound) never played, since game-over
  // returned early before the notch code ever ran. Now the room still
  // gets its last visible lurch even on the exact frame it runs out.
  const notchInterval = effectiveLimit / level.shrinkNotches;
  const notchesElapsed = Math.floor(GameState.elapsed / notchInterval);
  if (notchesElapsed > GameState.currentNotch) {
    GameState.currentNotch = notchesElapsed;
    triggerWallShrink(notchesElapsed, level);
  }

  if (timeRemaining <= 0) {
    GameState.isPlaying = false;
    GameState.combo = 0;
    SFX.stopBackground();
    SFX.gameOver();
    $('game-over-time').textContent = GameState.elapsed.toFixed(1);
    showOverlay('screen-game-over');
    return;
  }

  SFX.updateBackground(1 - timeRemaining / effectiveLimit);
}

function positionPuzzleLayer() {
  const layer = $('puzzle-layer');
  const size = GameState.displayedRoomSize;
  const inset = (600 - size) / 2;
  layer.style.left = inset + 'px';
  layer.style.top = inset + 'px';
  layer.style.width = size + 'px';
  layer.style.height = size + 'px';
}

function getCSSVar(name) {
  const v = getComputedStyle(document.body).getPropertyValue(name);
  return v ? v.trim() : '';
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function renderCanvas() {
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = getCSSVar('--bg-panel-raised') || '#3a2568';
  ctx.fillRect(0, 0, W, H);

  const activeWarning = GameState.isWarning && GameState.isPlaying;
  if (activeWarning) {
    ctx.save();
    ctx.globalAlpha = 0.12 + 0.07 * Math.sin(GameState.elapsed * 14);
    ctx.fillStyle = getCSSVar('--danger') || '#ff7a3d';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  const size = GameState.displayedRoomSize;
  const inset = (W - size) / 2;
  const roomColor = activeWarning ? (getCSSVar('--danger') || '#ff7a3d') : levelColor(getCurrentLevelData().id);

  ctx.fillStyle = getCSSVar('--bg-floor') || '#170c30';
  roundRectPath(ctx, inset, inset, size, size, 20);
  ctx.fill();

  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = roomColor;
  ctx.shadowColor = roomColor;
  ctx.shadowBlur = activeWarning ? 28 : 16;
  roundRectPath(ctx, inset, inset, size, size, 20);
  ctx.stroke();
  ctx.restore();

  drawParticles(ctx);
}

function gameLoopTick(timestamp) {
  if (!GameState.lastTimestamp) GameState.lastTimestamp = timestamp;
  let dt = (timestamp - GameState.lastTimestamp) / 1000;
  GameState.lastTimestamp = timestamp;
  dt = Math.min(dt, 0.1);

  if (GameState.isPlaying && !GameState.isPaused) updateGameplay(dt);
  GameState.displayedRoomSize += (GameState.targetRoomSize - GameState.displayedRoomSize) * Math.min(1, dt * 6);
  updateParticles(dt);
  updateShakeState(dt);
  positionPuzzleLayer();
  renderCanvas();

  requestAnimationFrame(gameLoopTick);
}

function switchAuthTab(tab) {
  $('tab-signin').classList.toggle('active', tab === 'signin');
  $('tab-signup').classList.toggle('active', tab === 'signup');
  $('panel-signin').style.display = tab === 'signin' ? 'flex' : 'none';
  $('panel-signup').style.display = tab === 'signup' ? 'flex' : 'none';
  $('signin-error').textContent = '';
  $('signup-error').textContent = '';
}

async function afterAuthSuccess(username) {
  GameState.username = username;
  persisted = await fetchProgress();
  document.body.dataset.theme = persisted.currentTheme;
  SFX.setMuted(!persisted.soundOn);
  syncDifficultyButtons();
  syncSoundButtons();
  renderThemeSwatches();
  renderLevelGrid();
  $('menu-player-tag').textContent = username.toUpperCase();
  $('settings-username').textContent = `Signed in as ${username}`;
  if (!persisted.hasSeenTutorial) openTutorial(true);
  else switchBaseScreen('screen-menu');
}

function openTutorial(fromLanding) {
  GameState.tutorialStep = 0;
  GameState.tutorialFromLanding = !!fromLanding;
  renderTutorialStep();
  showOverlay('screen-tutorial');
}
function renderTutorialStep() {
  const step = TUTORIAL_STEPS[GameState.tutorialStep];
  const isLast = GameState.tutorialStep === TUTORIAL_STEPS.length - 1;
  $('tutorial-step-label').textContent = `Step ${GameState.tutorialStep + 1} of ${TUTORIAL_STEPS.length}`;
  $('tutorial-title').textContent = step.title;
  $('tutorial-body').textContent = step.body;
  $('btn-tutorial-next').textContent = isLast ? "Let's Go" : 'Next';
  const dots = $('tutorial-dots');
  dots.innerHTML = '';
  TUTORIAL_STEPS.forEach((_, i) => {
    const dot = document.createElement('span');
    if (i === GameState.tutorialStep) dot.classList.add('on');
    dots.appendChild(dot);
  });
}
function advanceTutorial() {
  if (GameState.tutorialStep < TUTORIAL_STEPS.length - 1) { GameState.tutorialStep++; renderTutorialStep(); }
  else closeTutorial();
}
function closeTutorial() {
  hideOverlay('screen-tutorial');
  const cameFromLanding = GameState.tutorialFromLanding;
  persisted.hasSeenTutorial = true;
  savePersisted();
  if (cameFromLanding) startLevel(0);
  else switchBaseScreen('screen-menu');
}

function syncDifficultyButtons() {
  document.querySelectorAll('.diff-btn[data-difficulty]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.difficulty === persisted.difficulty);
  });
}
function syncSoundButtons() {
  document.querySelectorAll('.diff-btn[data-sound]').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.sound === 'on') === persisted.soundOn);
  });
  $('btn-sound-toggle').textContent = persisted.soundOn ? '🔊' : '🔇';
}
function setSound(on) {
  persisted.soundOn = on;
  SFX.setMuted(!on);
  savePersisted();
  syncSoundButtons();
}

async function initGame() {
  bindEvents();
  requestAnimationFrame(gameLoopTick);

  switchBaseScreen('screen-loading');
  const existingUser = await fetchMe();
  if (existingUser) {
    await afterAuthSuccess(existingUser);
  } else {
    switchBaseScreen('screen-landing');
  }
}

document.addEventListener('DOMContentLoaded', initGame);

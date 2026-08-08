// game.js
// Core loop: screen navigation plus the shrinking-room timer/canvas mechanic.
// Puzzle content is still a stub here — real puzzle types land next.

const STORAGE_KEY = 'shrinkingRoomState_v1';
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
  currentLevelIndex: 0,
  puzzleIndexInLevel: 0,
  combo: 0,
  isPaused: false,
  tutorialStep: 0,
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

function defaultPersisted() { return { profile: null, bestTimes: {}, unlockedThemes: ['amber'], currentTheme: 'amber', hasSeenTutorial: false, soundOn: true, difficulty: 'normal', stats: { roomsCleared: 0, bestStreak: 0 } }; }
function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Object.assign(defaultPersisted(), JSON.parse(raw)) : defaultPersisted();
  } catch (e) { return defaultPersisted(); }
}
function savePersisted() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); } catch (e) {} }
let persisted = null;

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

function renderLevelGrid() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const card = document.createElement('button');
    card.className = 'level-card';
    card.innerHTML = `<span class="level-num">${level.id}</span><span class="level-name">${level.name}</span>`;
    card.addEventListener('click', () => startLevel(i));
    grid.appendChild(card);
  });
}

function bindEvents() {
  $('btn-play').addEventListener('click', () => startLevel(0));
  $('btn-level-select').addEventListener('click', () => { renderLevelGrid(); switchBaseScreen('screen-level-select'); });
  $('btn-settings').addEventListener('click', () => { renderThemeSwatches(); syncDifficultyButtons(); syncSoundButtons(); switchBaseScreen('screen-settings'); });
  $('btn-back-from-levels').addEventListener('click', () => switchBaseScreen('screen-menu'));
  $('btn-back-from-settings').addEventListener('click', () => switchBaseScreen('screen-menu'));

  $('btn-pause').addEventListener('click', () => { GameState.isPaused = true; showOverlay('screen-pause'); });
  $('btn-resume').addEventListener('click', () => { GameState.isPaused = false; hideOverlay('screen-pause'); });
  $('btn-restart-from-pause').addEventListener('click', () => { GameState.isPaused = false; hideOverlay('screen-pause'); startLevel(GameState.currentLevelIndex); });
  $('btn-menu-from-pause').addEventListener('click', () => { GameState.isPaused = false; hideOverlay('screen-pause'); switchBaseScreen('screen-menu'); });
  $('btn-retry').addEventListener('click', () => { hideOverlay('screen-game-over'); startLevel(GameState.currentLevelIndex); });
  $('btn-menu-from-gameover').addEventListener('click', () => { hideOverlay('screen-game-over'); switchBaseScreen('screen-menu'); });
  $('btn-next-level').addEventListener('click', () => { hideOverlay('screen-level-complete'); startLevel(Math.min(GameState.currentLevelIndex + 1, LEVELS.length - 1)); });
  $('btn-menu-from-complete').addEventListener('click', () => { hideOverlay('screen-level-complete'); switchBaseScreen('screen-menu'); });

  SFX.unlock();
  $('btn-create-profile').addEventListener('click', () => {
    SFX.unlock();
    const name = $('input-callsign').value.trim().slice(0, 16);
    if (!name) { $('input-callsign').focus(); return; }
    persisted.profile = { name, createdAt: Date.now() };
    savePersisted();
    openTutorial();
  });
  $('btn-how-to-play').addEventListener('click', () => openTutorial());
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
  $('input-callsign').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-create-profile').click(); });
  $('btn-continue-profile').addEventListener('click', () => {
    if (!persisted.hasSeenTutorial) openTutorial(); else switchBaseScreen('screen-menu');
  });
  $('btn-switch-profile').addEventListener('click', () => switchProfile());
  $('btn-switch-profile-settings').addEventListener('click', () => { switchProfile(); switchBaseScreen('screen-landing'); });
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

function handlePuzzleSolved() {
  SFX.solved();
  spawnBurstParticles(300, 300, '#7fae72', 34);
  GameState.puzzleIndexInLevel++;
  const level = getCurrentLevelData();
  if (GameState.puzzleIndexInLevel < level.puzzles.length) {
    mountCurrentPuzzle();
  } else {
    handleLevelComplete();
  }
}

function handleLevelComplete() {
  GameState.isPlaying = false;
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
  const el = $('game-canvas');
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

  if (timeRemaining <= 0) {
    GameState.isPlaying = false;
    GameState.combo = 0;
    SFX.gameOver();
    $('game-over-time').textContent = GameState.elapsed.toFixed(1);
    showOverlay('screen-game-over');
    return;
  }

  const notchInterval = effectiveLimit / level.shrinkNotches;
  const notchesElapsed = Math.floor(GameState.elapsed / notchInterval);
  if (notchesElapsed > GameState.currentNotch) {
    GameState.currentNotch = notchesElapsed;
    triggerWallShrink(notchesElapsed, level);
  }
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

function renderCanvas() {
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#272219';
  ctx.fillRect(0, 0, W, H);

  const size = GameState.displayedRoomSize;
  const inset = (W - size) / 2;
  ctx.fillStyle = '#100e0a';
  ctx.fillRect(inset, inset, size, size);
  ctx.strokeStyle = '#ff7a1a';
  ctx.lineWidth = 3;
  ctx.strokeRect(inset, inset, size, size);
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

function renderLanding() {
  const hasProfile = !!(persisted.profile && persisted.profile.name);
  $('panel-create').style.display = hasProfile ? 'none' : 'flex';
  $('panel-welcome').style.display = hasProfile ? 'flex' : 'none';
  if (hasProfile) {
    const name = persisted.profile.name;
    $('welcome-name').textContent = name;
    $('welcome-badge').textContent = name.charAt(0).toUpperCase();
    $('welcome-stats').textContent = `${persisted.stats.roomsCleared} rooms cleared · best streak ${persisted.stats.bestStreak}`;
    $('menu-player-tag').textContent = name.toUpperCase();
  } else {
    $('input-callsign').value = '';
  }
}
function switchProfile() { persisted.profile = null; savePersisted(); renderLanding(); }

function openTutorial() {
  GameState.tutorialStep = 0;
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
  persisted.hasSeenTutorial = true;
  savePersisted();
  switchBaseScreen('screen-menu');
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

function initGame() {
  persisted = loadPersisted();
  document.body.dataset.theme = persisted.currentTheme;
  SFX.setMuted(!persisted.soundOn);
  renderLevelGrid();
  renderLanding();
  syncDifficultyButtons();
  syncSoundButtons();
  bindEvents();
  requestAnimationFrame(gameLoopTick);
}

document.addEventListener('DOMContentLoaded', initGame);

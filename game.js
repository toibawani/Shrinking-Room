// game.js
// Core loop: screen navigation plus the shrinking-room timer/canvas mechanic.
// Puzzle content is still a stub here — real puzzle types land next.

const STORAGE_KEY = 'shrinkingRoomState_v1';
const THEME_UNLOCK_COMBOS = { cyan: 3, violet: 6, emerald: 9 };

const GameState = {
  baseScreen: 'screen-menu',
  currentLevelIndex: 0,
  puzzleIndexInLevel: 0,
  combo: 0,
  isPaused: false,
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

function defaultPersisted() { return { bestTimes: {}, unlockedThemes: ['amber'], currentTheme: 'amber' }; }
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
  $('btn-settings').addEventListener('click', () => { renderThemeSwatches(); switchBaseScreen('screen-settings'); });
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
  const level = getCurrentLevelData();
  const timeTaken = GameState.elapsed;
  const prevBest = persisted.bestTimes[level.id];
  if (prevBest === undefined || timeTaken < prevBest) persisted.bestTimes[level.id] = timeTaken;

  if (timeTaken <= level.timeLimit * 0.6) GameState.combo++; else GameState.combo = 0;

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
  const timeRemaining = level.timeLimit - GameState.elapsed;
  $('hud-timer').textContent = formatTime(timeRemaining);
  $('hud-timer').classList.toggle('critical', timeRemaining <= 5);

  if (timeRemaining <= 0) {
    GameState.isPlaying = false;
    GameState.combo = 0;
    $('game-over-time').textContent = GameState.elapsed.toFixed(1);
    showOverlay('screen-game-over');
    return;
  }

  const notchInterval = level.timeLimit / level.shrinkNotches;
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

function initGame() {
  persisted = loadPersisted();
  document.body.dataset.theme = persisted.currentTheme;
  renderLevelGrid();
  bindEvents();
  requestAnimationFrame(gameLoopTick);
}

document.addEventListener('DOMContentLoaded', initGame);

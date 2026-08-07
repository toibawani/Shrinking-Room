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
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  GameState.baseScreen = id;
}

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
}

function startLevel(index) {
  GameState.currentLevelIndex = index;
  GameState.elapsed = 0;
  GameState.currentNotch = 0;
  const level = getCurrentLevelData();
  GameState.displayedRoomSize = level.initialRoomSize;
  GameState.targetRoomSize = level.initialRoomSize;
  $('hud-level').textContent = level.id;
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

  alert(`Room cleared! Streak: ${GameState.combo}`);
  switchBaseScreen('screen-menu');
}

function triggerWallShrink(notchIndex, level) {
  const shrinkPerNotch = (level.initialRoomSize - level.crushRoomSize) / level.shrinkNotches;
  GameState.targetRoomSize = Math.max(level.crushRoomSize, level.initialRoomSize - shrinkPerNotch * notchIndex);
}

function updateGameplay(dt) {
  GameState.elapsed += dt;
  const level = getCurrentLevelData();
  const timeRemaining = level.timeLimit - GameState.elapsed;
  $('hud-timer').textContent = formatTime(timeRemaining);
  $('hud-timer').classList.toggle('critical', timeRemaining <= 5);

  if (timeRemaining <= 0) {
    GameState.isPlaying = false;
    alert('Crushed!');
    switchBaseScreen('screen-menu');
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
}

function gameLoopTick(timestamp) {
  if (!GameState.lastTimestamp) GameState.lastTimestamp = timestamp;
  let dt = (timestamp - GameState.lastTimestamp) / 1000;
  GameState.lastTimestamp = timestamp;
  dt = Math.min(dt, 0.1);

  if (GameState.isPlaying) updateGameplay(dt);
  GameState.displayedRoomSize += (GameState.targetRoomSize - GameState.displayedRoomSize) * Math.min(1, dt * 6);
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

// game.js
// Core loop: screen navigation plus the shrinking-room timer/canvas mechanic.
// Puzzle content is still a stub here — real puzzle types land next.

const GameState = {
  baseScreen: 'screen-menu',
  currentLevelIndex: 0,
  puzzleIndexInLevel: 0,
  elapsed: 0,
  currentNotch: 0,
  displayedRoomSize: 520,
  targetRoomSize: 520,
  isWarning: false,
  isPlaying: false,
  lastTimestamp: 0,
};

function $(id) { return document.getElementById(id); }
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
  $('btn-settings').addEventListener('click', () => switchBaseScreen('screen-settings'));
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
    GameState.isPlaying = false;
    alert('Room cleared!');
    switchBaseScreen('screen-menu');
  }
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
  renderLevelGrid();
  bindEvents();
  requestAnimationFrame(gameLoopTick);
}

document.addEventListener('DOMContentLoaded', initGame);

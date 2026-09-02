// game.js — Core loop, navigation, shrinking-room canvas, persistence.

const DIFFICULTY_MULTIPLIERS = { easy: 1.35, normal: 1.0, hard: 0.72 };
const THEME_UNLOCK_COMBOS = { cyan: 3, violet: 6, emerald: 9 };
const STAGE_BASE = 600;
const WARNING_THRESHOLD = 5;

const TUTORIAL_STEPS = [
  { title: 'The room is shrinking.', body: 'Four walls close inward on a timer. Solve the puzzle at the center before they reach you.' },
  { title: 'Every room, a new challenge.', body: 'Patterns, memory, locks, hidden objects, wires, weights, and words. The hint below the room nudges you if you need it.' },
  { title: 'Speed builds your streak.', body: 'Clear a room with time to spare and your streak grows. Long streaks unlock new room themes.' },
  { title: 'Esc pauses. Retry is instant.', body: 'No loading screens. If the walls get you, you are back in within a second.' },
];

const GAME_OVER_TIPS = [
  'Watch the compression bar — it shows how close the walls are.',
  'Hints appear below the room. Use them.',
  'Wrong answers cost time, not lives. Keep trying.',
  'On Easy difficulty you get more time per room.',
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
  lastWarningBeep: 0,
  activePuzzle: null,
};

function $(id) { return document.getElementById(id); }

function defaultPersisted() {
  return {
    bestTimes: {},
    unlockedLevel: 1,
    unlockedThemes: ['amber'],
    currentTheme: 'amber',
    hasSeenTutorial: false,
    hasSeenIntro: false,
    soundOn: true,
    motionReduced: false,
    difficulty: 'normal',
    stats: { puzzlesSolved: 0, roomsCleared: 0, bestStreak: 0, totalPlayTime: 0 },
  };
}
let persisted = defaultPersisted();

async function apiFetch(url, options) {
  const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body ok */ }
  return { ok: res.ok, status: res.status, data };
}

async function fetchMe() {
  const { ok, data } = await apiFetch('/api/auth/me');
  return ok ? data.username : null;
}
async function fetchProgress() {
  const { ok, data } = await apiFetch('/api/progress');
  if (!ok) return defaultPersisted();
  return Object.assign(defaultPersisted(), data, {
    stats: Object.assign(defaultPersisted().stats, data.stats || {}),
  });
}
async function savePersisted() {
  try { await apiFetch('/api/progress', { method: 'PUT', body: JSON.stringify(persisted) }); }
  catch (e) { console.warn('Could not save progress:', e); }
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

function isMotionReduced() {
  return persisted.motionReduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyMotionPref() {
  document.body.dataset.motion = persisted.motionReduced ? 'reduced' : 'full';
}

function renderThemeSwatches() {
  const wrap = $('theme-swatches');
  wrap.innerHTML = '';
  ['amber', 'cyan', 'violet', 'emerald'].forEach(theme => {
    const unlocked = persisted.unlockedThemes.includes(theme);
    const swatch = document.createElement('button');
    swatch.className = 'theme-swatch theme-' + theme;
    if (theme === persisted.currentTheme) swatch.classList.add('active');
    if (!unlocked) swatch.classList.add('locked');
    swatch.disabled = !unlocked;
    swatch.setAttribute('aria-label', theme + ' theme');
    if (unlocked) {
      swatch.addEventListener('click', () => {
        persisted.currentTheme = theme;
        document.body.dataset.theme = theme;
        savePersisted();
        renderThemeSwatches();
        SFX.uiToggle();
      });
    }
    wrap.appendChild(swatch);
  });
}

function formatTime(s) { return Math.max(0, s).toFixed(1); }
function getCurrentLevelData() { return LEVELS[GameState.currentLevelIndex]; }
function getEffectiveTimeLimit(level) { return level.timeLimit * (DIFFICULTY_MULTIPLIERS[persisted.difficulty] || 1); }

function switchBaseScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    if (!s.classList.contains('overlay')) s.classList.remove('active');
  });
  $(id).classList.add('active');
  GameState.baseScreen = id;
  if (id === 'screen-menu') updateMenuStats();
}

function showOverlay(id) { $(id).classList.add('active'); }
function hideOverlay(id) { $(id).classList.remove('active'); }

const LEVEL_ACCENTS = ['#e8457a', '#2ee8b6', '#d4e847', '#a070ff', '#ff7744', '#44c8ff', '#8aff6b', '#ff6688', '#5cffe0', '#ffcf5c', '#c080ff', '#6dff8a'];
function levelAccent(levelId) { return LEVEL_ACCENTS[(levelId - 1) % LEVEL_ACCENTS.length]; }

function updateMenuStats() {
  const cleared = Object.keys(persisted.bestTimes).length;
  const total = LEVELS.length;
  $('menu-progress-fill').style.width = `${(cleared / total) * 100}%`;
  $('menu-progress-label').textContent = `${cleared} of ${total} rooms cleared`;

  const stats = persisted.stats;
  const parts = [];
  if (stats.bestStreak > 0) parts.push(`Best streak: ${stats.bestStreak}`);
  if (stats.puzzlesSolved > 0) parts.push(`${stats.puzzlesSolved} puzzles solved`);
  $('menu-stats').textContent = parts.join(' · ') || 'Clear rooms fast to build a streak';

  const playLabel = cleared >= total ? 'Replay' : cleared > 0 ? 'Continue' : 'Begin';
  $('btn-play').textContent = playLabel;
}

function renderLevelGrid() {
  const streakEl = $('level-select-streak');
  if (GameState.combo > 0) streakEl.textContent = `Current streak: ${GameState.combo}`;
  else if (persisted.stats.bestStreak > 0) streakEl.textContent = `Best streak: ${persisted.stats.bestStreak}`;
  else streakEl.textContent = 'Clear rooms quickly to build a streak';

  const container = $('level-chapters');
  container.innerHTML = '';

  CHAPTERS.forEach(chapter => {
    const chapterLevels = LEVELS.filter(l => l.chapter === chapter.id);
    if (!chapterLevels.length) return;

    const section = document.createElement('div');
    section.className = 'level-chapter';

    const header = document.createElement('div');
    header.className = 'level-chapter-header';
    header.innerHTML = `<span class="level-chapter-num">${chapter.label}</span><span class="level-chapter-name">${chapter.name}</span><span class="level-chapter-tagline">${chapter.tagline}</span>`;
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'level-grid';

    chapterLevels.forEach(level => {
      const i = LEVELS.indexOf(level);
      const locked = level.id > persisted.unlockedLevel;
      const cleared = persisted.bestTimes[level.id] !== undefined;
      const card = document.createElement('button');
      card.className = 'level-card' + (locked ? ' locked' : '') + (cleared ? ' cleared' : '');
      card.disabled = locked;
      if (!locked) card.style.setProperty('--level-accent', levelAccent(level.id));

      const best = persisted.bestTimes[level.id];
      const prevName = i > 0 ? LEVELS[i - 1].name : '';
      card.innerHTML = locked
        ? `<span class="level-num">${level.id}</span><span class="level-name">Clear "${prevName}"</span>`
        : `<span class="level-num">${level.id}</span><span class="level-name">${level.name}</span><span class="level-best">${best !== undefined ? best.toFixed(1) + 's' : '—'}</span>`;

      if (!locked) card.addEventListener('click', () => { SFX.click(); startLevel(i); });
      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });
}

function destroyActivePuzzle() {
  if (GameState.activePuzzle && GameState.activePuzzle.destroy) {
    GameState.activePuzzle.destroy();
  }
  GameState.activePuzzle = null;
}

function pauseGame() {
  if (!GameState.isPlaying || GameState.isPaused) return;
  GameState.isPaused = true;
  SFX.pauseBackground();
  const level = getCurrentLevelData();
  $('pause-room-num').textContent = level.id;
  $('pause-room-name').textContent = level.name;
  showOverlay('screen-pause');
}

function resumeGame() {
  if (!GameState.isPaused) return;
  GameState.isPaused = false;
  SFX.resumeBackground();
  hideOverlay('screen-pause');
}

function bindEvents() {
  $('btn-play').addEventListener('click', () => {
    SFX.click();
    const idx = Math.min(persisted.unlockedLevel - 1, LEVELS.length - 1);
    startLevel(Math.max(0, idx));
  });
  $('btn-level-select').addEventListener('click', () => { renderLevelGrid(); switchBaseScreen('screen-level-select'); });
  $('btn-settings').addEventListener('click', () => {
    renderThemeSwatches();
    syncDifficultyButtons();
    syncSoundButtons();
    syncMotionButtons();
    switchBaseScreen('screen-settings');
  });
  $('btn-back-from-levels').addEventListener('click', () => switchBaseScreen('screen-menu'));
  $('btn-back-from-settings').addEventListener('click', () => switchBaseScreen('screen-menu'));

  $('btn-pause').addEventListener('click', () => { SFX.click(); pauseGame(); });
  $('btn-resume').addEventListener('click', () => { SFX.click(); resumeGame(); });
  $('btn-restart-from-pause').addEventListener('click', () => {
    resumeGame();
    startLevel(GameState.currentLevelIndex);
  });
  $('btn-menu-from-pause').addEventListener('click', () => {
    GameState.isPaused = false;
    GameState.isPlaying = false;
    destroyActivePuzzle();
    SFX.stopBackground();
    hideOverlay('screen-pause');
    switchBaseScreen('screen-menu');
  });

  $('btn-retry').addEventListener('click', () => { hideOverlay('screen-game-over'); startLevel(GameState.currentLevelIndex); });
  $('btn-menu-from-gameover').addEventListener('click', () => {
    destroyActivePuzzle();
    hideOverlay('screen-game-over');
    switchBaseScreen('screen-menu');
  });

  $('btn-next-level').addEventListener('click', () => {
    hideOverlay('screen-level-complete');
    const next = GameState.currentLevelIndex + 1;
    if (next >= LEVELS.length) showEndgame();
    else if (next < persisted.unlockedLevel) startLevel(next);
    else startLevel(GameState.currentLevelIndex);
  });
  $('btn-menu-from-complete').addEventListener('click', () => { hideOverlay('screen-level-complete'); switchBaseScreen('screen-menu'); });

  $('btn-replay-endgame').addEventListener('click', () => { hideOverlay('screen-endgame'); startLevel(0); });
  $('btn-menu-from-endgame').addEventListener('click', () => { hideOverlay('screen-endgame'); switchBaseScreen('screen-menu'); });

  $('btn-enter-game').addEventListener('click', () => {
    SFX.unlock();
    SFX.click();
    persisted.hasSeenIntro = true;
    savePersisted();
    if (!persisted.hasSeenTutorial) openTutorial(true);
    else switchBaseScreen('screen-menu');
  });

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
      SFX.uiToggle();
    });
  });
  document.querySelectorAll('.diff-btn[data-motion]').forEach(btn => {
    btn.addEventListener('click', () => {
      persisted.motionReduced = btn.dataset.motion === 'reduced';
      applyMotionPref();
      savePersisted();
      syncMotionButtons();
      SFX.uiToggle();
    });
  });

  $('btn-logout').addEventListener('click', () => logOut());
  $('btn-reset-progress').addEventListener('click', () => {
    if (!confirm('Reset all progress? Best times, unlocks, and stats will be lost.')) return;
    const keep = { soundOn: persisted.soundOn, motionReduced: persisted.motionReduced, difficulty: persisted.difficulty, hasSeenTutorial: true, hasSeenIntro: true };
    persisted = Object.assign(defaultPersisted(), keep);
    GameState.combo = 0;
    savePersisted();
    renderThemeSwatches();
    updateMenuStats();
    SFX.uiToggle();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('screen-pause').classList.contains('active')) resumeGame();
      else if (GameState.isPlaying && GameState.baseScreen === 'screen-game') pauseGame();
      return;
    }
    if (GameState.activePuzzle && GameState.activePuzzle.onKey && GameState.isPlaying && !GameState.isPaused) {
      if (e.key === 'Enter' || e.key === 'Backspace') {
        e.preventDefault();
        GameState.activePuzzle.onKey(e.key);
      }
    }
  });

  window.addEventListener('resize', updateStageScale);
}

function updateStageScale() {
  const scaler = $('stage-scaler');
  if (!scaler) return;
  const maxW = Math.min(window.innerWidth - 40, 600);
  const scale = Math.min(1, maxW / STAGE_BASE);
  scaler.style.setProperty('--stage-scale', scale.toFixed(3));
}

function startLevel(index) {
  destroyActivePuzzle();
  GameState.currentLevelIndex = index;
  GameState.elapsed = 0;
  GameState.currentNotch = 0;
  GameState.isWarning = false;
  GameState.lastWarningBeep = 0;
  GameState.isPaused = false;

  const level = getCurrentLevelData();
  GameState.displayedRoomSize = level.initialRoomSize;
  GameState.targetRoomSize = level.initialRoomSize;

  $('hud-level').textContent = level.id;
  $('hud-chapter').textContent = getLevelChapter(level).name;
  const best = persisted.bestTimes[level.id];
  $('hud-best').textContent = best !== undefined ? best.toFixed(1) + 's' : '—';

  const streakWrap = $('hud-streak-wrap');
  if (GameState.combo > 0) {
    streakWrap.hidden = false;
    $('hud-streak').textContent = GameState.combo;
  } else {
    streakWrap.hidden = true;
  }

  $('stage-objective').textContent = level.subtitle || '';
  $('stage-frame').classList.remove('warning');
  $('compression-fill').style.width = '0%';
  $('compression-fill').classList.remove('high');

  switchBaseScreen('screen-game');
  updateStageScale();
  GameState.isPlaying = true;
  SFX.startBackground();

  GameState.puzzleIndexInLevel = 0;
  mountCurrentPuzzle();
}

function mountCurrentPuzzle() {
  destroyActivePuzzle();
  const level = getCurrentLevelData();
  const puzzleConfig = level.puzzles[GameState.puzzleIndexInLevel];
  const layer = $('puzzle-layer');
  layer.innerHTML = '';
  GameState.activePuzzle = Puzzles.create(puzzleConfig.type, puzzleConfig.params, layer, handlePuzzleSolved);

  const multiTag = level.puzzles.length > 1 ? ` · ${GameState.puzzleIndexInLevel + 1}/${level.puzzles.length}` : '';
  $('stage-hint').textContent = Puzzles.hint(puzzleConfig.type) + multiTag;
}

function fireSolveFlash(color, big) {
  if (!isMotionReduced()) {
    const flash = $('solve-flash');
    flash.style.setProperty('--flash-color', color);
    flash.classList.remove('firing');
    void flash.offsetWidth;
    flash.classList.add('firing');
    const frame = $('stage-frame');
    frame.classList.remove('solved-kick');
    void frame.offsetWidth;
    frame.classList.add('solved-kick');
    spawnBurstParticles(STAGE_BASE / 2, STAGE_BASE / 2, color, big ? 50 : 28);
  }
}

function handlePuzzleSolved() {
  SFX.solved();
  persisted.stats.puzzlesSolved++;
  const level = getCurrentLevelData();
  const isLastPuzzleInLevel = GameState.puzzleIndexInLevel + 1 >= level.puzzles.length;
  fireSolveFlash(getCSSVar('--success') || '#2ee8b6', isLastPuzzleInLevel);
  GameState.puzzleIndexInLevel++;
  if (GameState.puzzleIndexInLevel < level.puzzles.length) {
    mountCurrentPuzzle();
  } else {
    handleLevelComplete();
  }
}

function handleLevelComplete() {
  GameState.isPlaying = false;
  destroyActivePuzzle();
  SFX.stopBackground();
  SFX.levelComplete();

  const level = getCurrentLevelData();
  const timeTaken = GameState.elapsed;
  const prevBest = persisted.bestTimes[level.id];
  const isNewRecord = prevBest === undefined || timeTaken < prevBest;
  if (isNewRecord) persisted.bestTimes[level.id] = timeTaken;

  if (level.id >= persisted.unlockedLevel && level.id < LEVELS.length) {
    persisted.unlockedLevel = level.id + 1;
  }

  const effectiveLimit = getEffectiveTimeLimit(level);
  if (timeTaken <= effectiveLimit * 0.6) GameState.combo++;
  else GameState.combo = 0;

  persisted.stats.roomsCleared++;
  persisted.stats.bestStreak = Math.max(persisted.stats.bestStreak, GameState.combo);
  persisted.stats.totalPlayTime = (persisted.stats.totalPlayTime || 0) + timeTaken;

  let unlockedTheme = null;
  Object.keys(THEME_UNLOCK_COMBOS).forEach(theme => {
    if (GameState.combo >= THEME_UNLOCK_COMBOS[theme] && !persisted.unlockedThemes.includes(theme)) {
      persisted.unlockedThemes.push(theme);
      unlockedTheme = theme;
    }
  });
  savePersisted();

  $('complete-room-name').textContent = level.name;
  $('complete-time').textContent = timeTaken.toFixed(1);
  $('complete-combo').textContent = GameState.combo;
  $('complete-record').hidden = !isNewRecord;
  const unlockEl = $('complete-unlock');
  if (unlockedTheme) {
    unlockEl.hidden = false;
    unlockEl.textContent = `New theme unlocked: ${unlockedTheme}!`;
  } else {
    unlockEl.hidden = true;
  }

  const nextBtn = $('btn-next-level');
  if (level.id >= LEVELS.length) {
    nextBtn.textContent = 'See Results';
  } else {
    nextBtn.textContent = 'Next Room';
  }

  showOverlay('screen-level-complete');
}

function showEndgame() {
  const stats = persisted.stats;
  const totalTime = Object.values(persisted.bestTimes).reduce((a, b) => a + b, 0);
  $('endgame-stats').innerHTML = `
    <div class="endgame-stat"><span class="endgame-stat-value">${Object.keys(persisted.bestTimes).length}</span><span class="endgame-stat-label">Rooms cleared</span></div>
    <div class="endgame-stat"><span class="endgame-stat-value">${totalTime.toFixed(1)}s</span><span class="endgame-stat-label">Total best time</span></div>
    <div class="endgame-stat"><span class="endgame-stat-value">${stats.bestStreak}</span><span class="endgame-stat-label">Best streak</span></div>
    <div class="endgame-stat"><span class="endgame-stat-value">${stats.puzzlesSolved}</span><span class="endgame-stat-label">Puzzles solved</span></div>
  `;
  showOverlay('screen-endgame');
}

function triggerWallShrink(notchIndex, level) {
  const shrinkPerNotch = (level.initialRoomSize - level.crushRoomSize) / level.shrinkNotches;
  GameState.targetRoomSize = Math.max(level.crushRoomSize, level.initialRoomSize - shrinkPerNotch * notchIndex);
  SFX.shrink();
  if (!isMotionReduced()) shakeScreen(280, 7);
}

function shakeScreen(duration, intensity) {
  GameState.shake = { duration, intensity, elapsed: 0, active: true };
}

function updateShakeState(dt) {
  const el = $('stage-shake');
  const s = GameState.shake;
  if (!s || !s.active || isMotionReduced()) { el.style.transform = ''; return; }
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
    const speed = 60 + Math.random() * 180;
    GameState.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.4 + Math.random() * 0.35, age: 0, size: 2 + Math.random() * 2.5, color });
  }
}

function updateParticles(dt) {
  GameState.particles.forEach(p => { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; });
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

function getRoomCompression(level) {
  const range = level.initialRoomSize - level.crushRoomSize;
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, (level.initialRoomSize - GameState.displayedRoomSize) / range));
}

function updateCompressionUI(compression) {
  const fill = $('compression-fill');
  fill.style.width = `${compression * 100}%`;
  fill.classList.toggle('high', compression > 0.7);
}

function updateCompressionFromRoom() {
  if (GameState.baseScreen !== 'screen-game') return;
  updateCompressionUI(getRoomCompression(getCurrentLevelData()));
}

function updateGameplay(dt) {
  GameState.elapsed += dt;
  const level = getCurrentLevelData();
  const effectiveLimit = getEffectiveTimeLimit(level);
  const timeRemaining = effectiveLimit - GameState.elapsed;
  const progress = Math.min(1, GameState.elapsed / effectiveLimit);

  $('hud-timer').textContent = formatTime(timeRemaining);
  $('hud-timer').classList.toggle('critical', timeRemaining <= WARNING_THRESHOLD);

  const wasWarning = GameState.isWarning;
  GameState.isWarning = timeRemaining <= WARNING_THRESHOLD && timeRemaining > 0;
  $('stage-frame').classList.toggle('warning', GameState.isWarning);

  if (GameState.isWarning && !wasWarning) SFX.warning();
  if (GameState.isWarning && GameState.elapsed - GameState.lastWarningBeep > 1.2) {
    SFX.warning();
    GameState.lastWarningBeep = GameState.elapsed;
  }

  const notchInterval = effectiveLimit / level.shrinkNotches;
  const notchesElapsed = Math.floor(GameState.elapsed / notchInterval);
  if (notchesElapsed > GameState.currentNotch) {
    GameState.currentNotch = notchesElapsed;
    triggerWallShrink(notchesElapsed, level);
  }

  if (timeRemaining <= 0) {
    GameState.isPlaying = false;
    GameState.combo = 0;
    destroyActivePuzzle();
    SFX.stopBackground();
    SFX.gameOver();
    $('game-over-time').textContent = GameState.elapsed.toFixed(1);
    $('game-over-tip').textContent = GAME_OVER_TIPS[Math.floor(Math.random() * GAME_OVER_TIPS.length)];
    showOverlay('screen-game-over');
    return;
  }

  SFX.updateBackground(progress);
}

function positionPuzzleLayer() {
  const layer = $('puzzle-layer');
  const size = GameState.displayedRoomSize;
  const inset = (STAGE_BASE - size) / 2;
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

  const level = GameState.isPlaying || GameState.baseScreen === 'screen-game' ? getCurrentLevelData() : LEVELS[0];
  const size = GameState.displayedRoomSize;
  const inset = (W - size) / 2;
  const compression = 1 - (size - level.crushRoomSize) / (level.initialRoomSize - level.crushRoomSize);
  const activeWarning = GameState.isWarning && GameState.isPlaying;
  const accent = activeWarning ? (getCSSVar('--danger') || '#ff5533') : levelAccent(level.id);

  // Outer void
  ctx.fillStyle = getCSSVar('--bg-panel-raised') || '#261838';
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, size * 0.3, W / 2, H / 2, W * 0.55);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  if (activeWarning && !isMotionReduced()) {
    ctx.save();
    ctx.globalAlpha = 0.08 + 0.05 * Math.sin(GameState.elapsed * 12);
    ctx.fillStyle = getCSSVar('--danger') || '#ff5533';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Floor
  ctx.fillStyle = getCSSVar('--bg-floor') || '#0c0714';
  roundRectPath(ctx, inset, inset, size, size, 18);
  ctx.fill();

  // Floor grid — denser as room shrinks
  ctx.save();
  roundRectPath(ctx, inset, inset, size, size, 18);
  ctx.clip();
  const gridStep = Math.max(20, 40 - compression * 15);
  ctx.strokeStyle = `rgba(245, 235, 255, ${0.03 + compression * 0.04})`;
  ctx.lineWidth = 1;
  for (let x = inset; x <= inset + size; x += gridStep) {
    ctx.beginPath(); ctx.moveTo(x, inset); ctx.lineTo(x, inset + size); ctx.stroke();
  }
  for (let y = inset; y <= inset + size; y += gridStep) {
    ctx.beginPath(); ctx.moveTo(inset, y); ctx.lineTo(inset + size, y); ctx.stroke();
  }
  ctx.restore();

  // Inner glow — intensifies with compression
  ctx.save();
  roundRectPath(ctx, inset + 8, inset + 8, size - 16, size - 16, 14);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.06 + compression * 0.12;
  ctx.lineWidth = 20;
  ctx.stroke();
  ctx.restore();

  // Corner stress brackets
  const bracketLen = 16 + compression * 8;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2 + compression;
  ctx.globalAlpha = 0.4 + compression * 0.4;
  const corners = [
    [inset, inset, 1, 1], [inset + size, inset, -1, 1],
    [inset, inset + size, 1, -1], [inset + size, inset + size, -1, -1],
  ];
  corners.forEach(([cx, cy, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * bracketLen);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * bracketLen, cy);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // Wall border
  ctx.save();
  ctx.lineWidth = 3 + compression * 2;
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = activeWarning ? 32 : 12 + compression * 12;
  roundRectPath(ctx, inset, inset, size, size, 18);
  ctx.stroke();
  ctx.restore();

  // Compression rings (ghost walls)
  if (compression > 0.2) {
    const rings = Math.min(3, Math.floor(compression * 4));
    for (let i = 1; i <= rings; i++) {
      const offset = i * 6;
      ctx.save();
      ctx.globalAlpha = 0.06 * (rings - i + 1);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      roundRectPath(ctx, inset - offset, inset - offset, size + offset * 2, size + offset * 2, 18 + offset);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawParticles(ctx);
}

function gameLoopTick(timestamp) {
  if (!GameState.lastTimestamp) GameState.lastTimestamp = timestamp;
  let dt = (timestamp - GameState.lastTimestamp) / 1000;
  GameState.lastTimestamp = timestamp;
  dt = Math.min(dt, 0.1);

  if (GameState.isPlaying && !GameState.isPaused) updateGameplay(dt);
  GameState.displayedRoomSize += (GameState.targetRoomSize - GameState.displayedRoomSize) * Math.min(1, dt * 6);
  updateCompressionFromRoom();
  updateParticles(dt);
  updateShakeState(dt);
  positionPuzzleLayer();
  renderCanvas();

  requestAnimationFrame(gameLoopTick);
}

function switchAuthTab(tab) {
  $('tab-signin').classList.toggle('active', tab === 'signin');
  $('tab-signup').classList.toggle('active', tab === 'signup');
  $('tab-signin').setAttribute('aria-selected', tab === 'signin');
  $('tab-signup').setAttribute('aria-selected', tab === 'signup');
  $('panel-signin').style.display = tab === 'signin' ? 'flex' : 'none';
  $('panel-signup').style.display = tab === 'signup' ? 'flex' : 'none';
  $('signin-error').textContent = '';
  $('signup-error').textContent = '';
}

async function afterAuthSuccess(username) {
  GameState.username = username;
  persisted = await fetchProgress();
  document.body.dataset.theme = persisted.currentTheme;
  applyMotionPref();
  SFX.setMuted(!persisted.soundOn);
  syncDifficultyButtons();
  syncSoundButtons();
  syncMotionButtons();
  renderThemeSwatches();
  renderLevelGrid();
  updateMenuStats();
  $('menu-player-tag').textContent = username.toUpperCase();
  $('settings-username').textContent = `Signed in as ${username}`;

  if (!persisted.hasSeenIntro) switchBaseScreen('screen-intro');
  else if (!persisted.hasSeenTutorial) openTutorial(true);
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
  persisted.hasSeenTutorial = true;
  savePersisted();
  if (GameState.tutorialFromLanding) startLevel(0);
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
function syncMotionButtons() {
  document.querySelectorAll('.diff-btn[data-motion]').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.motion === 'reduced') === persisted.motionReduced);
  });
}
function setSound(on) {
  persisted.soundOn = on;
  SFX.setMuted(!on);
  savePersisted();
  syncSoundButtons();
}

async function initGame() {
  bindEvents();
  updateStageScale();
  requestAnimationFrame(gameLoopTick);

  switchBaseScreen('screen-loading');
  const existingUser = await fetchMe();
  if (existingUser) await afterAuthSuccess(existingUser);
  else switchBaseScreen('screen-landing');
}

document.addEventListener('DOMContentLoaded', initGame);

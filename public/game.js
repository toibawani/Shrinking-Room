// game.js — Core loop, navigation, shrinking-room canvas, persistence.

const DIFFICULTY_MULTIPLIERS = { easy: 1.35, normal: 1.0, hard: 0.72 };
const STAGE_BASE = 600;
const WARNING_THRESHOLD = 5;

const TUTORIAL_STEPS = [
  { title: 'The room is shrinking.', body: 'Four walls close inward on a timer. Solve the puzzle at the center before they reach you.' },
  { title: 'Every room, a new challenge.', body: 'Patterns, memory, locks, hidden objects, wires, weights, and words. The hint below the room nudges you if you need it.' },
  { title: 'Speed builds your streak.', body: 'Clear a room with time to spare and your streak grows. Long streaks unlock new room themes.' },
  { title: 'Esc pauses. Retry is instant.', body: 'No loading screens. If the walls get you, you are back in within a second.' },
];

const GAME_OVER_TIPS = [
  'Watch the compression bar. It shows how close the walls are.',
  'Hints appear below the room. Use them.',
  'Wrong answers cost time, not lives. Keep trying.',
  'On Easy difficulty you get more time per room.',
];

const CHAPTER_ONE_IDS = LEVELS.filter(level => level.chapter === CHAPTERS[0].id).map(level => level.id);
const GUEST_MAX_LEVEL = CHAPTER_ONE_IDS[CHAPTER_ONE_IDS.length - 1];
const GUEST_KEY = 'sr_guest_progress_v1';

const GameState = {
  baseScreen: 'screen-landing',
  username: null,
  isGuest: false,
  authTab: 'signin',
  previews: [],
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

// Guest progress lives in this browser only. The server never reads it, and
// the only thing it can ever receive is chapter one best times, re-checked on
// the server.
function readGuestProgress() {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Object.assign(defaultPersisted(), data, {
      stats: Object.assign(defaultPersisted().stats, data.stats || {}),
    });
  } catch (e) {
    return null;
  }
}
function hasGuestSave() {
  const guest = readGuestProgress();
  return !!guest && Object.keys(guest.bestTimes || {}).some(id => CHAPTER_ONE_IDS.includes(Number(id)));
}
function clearGuestSave() {
  try { localStorage.removeItem(GUEST_KEY); } catch (e) { /* private mode */ }
}
function guestChapterOneTimes() {
  const guest = readGuestProgress();
  if (!guest) return {};
  const times = {};
  CHAPTER_ONE_IDS.forEach(id => {
    const value = Number(guest.bestTimes && guest.bestTimes[id]);
    if (Number.isFinite(value) && value > 0) times[id] = value;
  });
  return times;
}

async function apiFetch(url, options) {
  try {
    const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body ok */ }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null };
  }
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
  if (GameState.isGuest) {
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(persisted)); }
    catch (e) { console.warn('Could not save guest progress:', e); }
    return;
  }
  try { await apiFetch('/api/progress', { method: 'PUT', body: JSON.stringify(persisted) }); }
  catch (e) { console.warn('Could not save progress:', e); }
}

const USERNAME_MIN = 3;
const USERNAME_MAX = 24;
const USERNAME_CHARS_RE = /^[A-Za-z0-9_]+$/;
const PASSWORD_MIN = 10;

// Mirrors the rule in src/auth.js. Nothing is truncated: an over-long name is
// refused with a message so the player can see what they actually typed.
function usernameProblem(rawValue) {
  const username = rawValue.trim();
  if (!username) return 'Enter a username.';
  if (username.includes('@')) return 'Use your username, not an email.';
  if (username.length < USERNAME_MIN) return `Usernames are at least ${USERNAME_MIN} characters.`;
  if (username.length > USERNAME_MAX) return `Usernames are at most ${USERNAME_MAX} characters.`;
  if (!USERNAME_CHARS_RE.test(username)) return 'Letters, numbers, and underscores only.';
  return null;
}

// The email message shows the moment an @ is typed, and clears itself once the
// character is gone.
function bindUsernameField(inputId, errorId) {
  const input = $(inputId);
  const error = $(errorId);
  input.addEventListener('input', () => {
    if (input.value.includes('@')) error.textContent = 'Use your username, not an email.';
    else if (error.textContent === 'Use your username, not an email.') error.textContent = '';
  });
}

async function signUp(username, password) {
  return apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ username, password }) });
}
async function signIn(username, password) {
  return apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}
async function logOut() {
  if (!GameState.isGuest) {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  }
  GameState.isGuest = false;
  GameState.username = null;
  persisted = defaultPersisted();
  showLanding();
}

async function resetProgress() {
  if (!confirm('Reset all progress? Best times, unlocks, and stats will be lost.')) return;
  const keep = {
    soundOn: persisted.soundOn,
    motionReduced: persisted.motionReduced,
    difficulty: persisted.difficulty,
    hasSeenTutorial: true,
    hasSeenIntro: true,
  };
  if (GameState.isGuest) clearGuestSave();
  else await apiFetch('/api/progress/reset', { method: 'POST' });
  persisted = Object.assign(defaultPersisted(), keep);
  GameState.combo = 0;
  savePersisted();
  renderLevelGrid();
  updateMenuStats();
  SFX.uiToggle();
}

function isMotionReduced() {
  return persisted.motionReduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyMotionPref() {
  document.body.dataset.motion = persisted.motionReduced ? 'reduced' : 'full';
  startPreviews();
}

// The auth screen and the title screen both run the real room renderer.
function startPreviews() {
  GameState.previews.forEach(preview => preview.destroy());
  GameState.previews = [];
  const reduced = isMotionReduced();
  const base = { initialSize: 520, crushSize: 190, stage: 600, notches: 4, reduced };
  const authCanvas = $('auth-room-canvas');
  if (authCanvas && !$('screen-landing').hidden) {
    GameState.previews.push(RoomRender.mountPreview(authCanvas, base));
  }
  const introCanvas = $('intro-room-canvas');
  if (introCanvas) {
    GameState.previews.push(RoomRender.mountPreview(introCanvas, Object.assign({}, base, { duration: 11000, hold: 1800 })));
  }
  const menuCanvas = $('menu-room-canvas');
  if (menuCanvas && $('screen-menu').classList.contains('active')) {
    GameState.previews.push(RoomRender.mountPreview(menuCanvas, Object.assign({}, base, { duration: 10000 })));
  }
}

function showLanding(preferredTab) {
  switchAuthTab(preferredTab === 'signup' ? 'signup' : 'signin');
  switchBaseScreen('screen-landing');
  setAuthChecking(false);
  updateGuestEntry();
  startPreviews();
}

function updateGuestEntry() {
  const button = $('btn-guest');
  if (!button) return;
  button.textContent = hasGuestSave()
    ? 'Continue chapter one as a guest'
    : 'Play chapter one without an account';
  button.hidden = GameState.isGuest;
  $('auth-note').hidden = GameState.isGuest;
}

function setAuthChecking(checking) {
  $('auth-skeleton').hidden = !checking;
  $('auth-tabs').hidden = checking;
  $('btn-guest').hidden = checking || GameState.isGuest;
  $('auth-note').hidden = checking || GameState.isGuest;
  $('panel-signin').hidden = checking || GameState.authTab !== 'signin';
  $('panel-signup').hidden = checking || GameState.authTab !== 'signup';
}

// The panel is a room. A failed attempt tightens it.
let tightenTimer = null;
function roomReject() {
  const panel = $('auth-panel');
  panel.classList.remove('room-tighten');
  void panel.offsetWidth;
  panel.classList.add('room-tighten');
  clearTimeout(tightenTimer);
  tightenTimer = setTimeout(() => panel.classList.remove('room-tighten'), 600);
}

function applyPersistedSettings() {
  applyMotionPref();
  SFX.setMuted(!persisted.soundOn);
  syncDifficultyButtons();
  syncSoundButtons();
  syncMotionButtons();
  $('settings-username').textContent = GameState.isGuest
    ? 'Playing as a guest. Progress stays in this browser.'
    : `Signed in as ${GameState.username}`;
  $('btn-logout').hidden = GameState.isGuest;
  $('btn-settings-signin').hidden = !GameState.isGuest;
  $('btn-reset-progress').hidden = GameState.isGuest;
}

function startGuest() {
  SFX.unlock();
  SFX.click();
  GameState.isGuest = true;
  GameState.username = null;
  persisted = readGuestProgress() || defaultPersisted();
  applyPersistedSettings();
  renderLevelGrid();
  updateMenuStats();
  finishAuthNavigation();
}

function finishAuthNavigation() {
  if (!persisted.hasSeenIntro) { switchBaseScreen('screen-intro'); startPreviews(); return; }
  if (!persisted.hasSeenTutorial) { openTutorial(true); return; }
  switchBaseScreen('screen-menu');
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
  if (id === 'screen-menu') { updateMenuStats(); startPreviews(); }
}

function showOverlay(id) { $(id).classList.add('active'); }
function hideOverlay(id) { $(id).classList.remove('active'); }

function updateMenuStats() {
  const cleared = Object.keys(persisted.bestTimes).length;
  const total = LEVELS.length;
  $('menu-progress-fill').style.width = `${(cleared / total) * 100}%`;
  $('menu-progress-label').textContent = `${cleared} of ${total} rooms cleared`;

  const stats = persisted.stats;
  const parts = [];
  if (stats.bestStreak > 0) parts.push(`Best streak: ${stats.bestStreak}`);
  if (stats.puzzlesSolved > 0) parts.push(`${stats.puzzlesSolved} puzzles solved`);
  $('menu-stats').textContent = GameState.isGuest
    ? 'Guest save. Nothing leaves this browser.'
    : (parts.join(' · ') || 'Clear rooms fast to build a streak');

  const playLabel = cleared >= total ? 'Replay' : cleared > 0 ? 'Continue' : 'Begin';
  $('btn-play').textContent = playLabel;

  const nextLevel = LEVELS[Math.min(persisted.unlockedLevel - 1, LEVELS.length - 1)];
  $('menu-room-caption').textContent = `Room ${String(nextLevel.id).padStart(2, '0')} \u00b7 ${getEffectiveTimeLimit(nextLevel).toFixed(0)}s`;
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
      card.className = 'level-card' + (locked ? ' locked' : '');
      card.disabled = locked;

      const best = persisted.bestTimes[level.id];
      const prevName = i > 0 ? LEVELS[i - 1].name : '';
      const guestLocked = GameState.isGuest && level.id > GUEST_MAX_LEVEL;
      const lockedLabel = guestLocked ? 'Account required' : `Clear "${prevName}"`;
      card.innerHTML = locked
        ? `<span class="level-num">${level.id}</span><span class="level-name">${level.name}</span><span class="level-best">${lockedLabel}</span>`
        : `<span class="level-num">${level.id}</span><span class="level-name">${level.name}</span><span class="level-best">${best !== undefined ? best.toFixed(1) + 's' : 'Not cleared'}</span>`;

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
  GameState.shake = null;
  $('stage-shake').style.transform = '';
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
    syncDifficultyButtons();
    syncSoundButtons();
    syncMotionButtons();
    switchBaseScreen('screen-settings');
  });
  $('btn-settings-signin').addEventListener('click', () => { SFX.click(); showLanding('signup'); });
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
    if (GameState.isGuest && getCurrentLevelData().id >= GUEST_MAX_LEVEL) { showLanding(); return; }
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
  bindUsernameField('signin-username', 'signin-error');
  bindUsernameField('signup-username', 'signup-error');

  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = $(button.dataset.togglePassword);
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.textContent = showing ? 'Show password' : 'Hide password';
      button.setAttribute('aria-pressed', String(!showing));
    });
  });

  $('btn-guest').addEventListener('click', startGuest);
  $('btn-carry-yes').addEventListener('click', () => decideCarry(true));
  $('btn-carry-no').addEventListener('click', () => decideCarry(false));

  $('panel-signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    SFX.unlock();
    const username = $('signin-username').value.trim();
    const password = $('signin-password').value;
    $('signin-error').textContent = '';
    $('signin-username').removeAttribute('aria-invalid');
    const problem = usernameProblem(username);
    if (problem) {
      $('signin-error').textContent = problem;
      $('signin-username').setAttribute('aria-invalid', 'true');
      $('signin-username').focus();
      return;
    }
    const { ok, data } = await signIn(username, password);
    if (!ok) {
      $('signin-error').textContent = (data && data.error) || 'Could not reach the room.';
      roomReject();
      return;
    }
    await afterAuthSuccess(data.username);
  });

  $('panel-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    SFX.unlock();
    const username = $('signup-username').value.trim();
    const password = $('signup-password').value;
    const confirm = $('signup-confirm').value;
    $('signup-error').textContent = '';
    $('signup-username').removeAttribute('aria-invalid');
    $('signup-password').removeAttribute('aria-invalid');
    const problem = usernameProblem(username);
    if (problem) {
      $('signup-error').textContent = problem;
      $('signup-username').setAttribute('aria-invalid', 'true');
      $('signup-username').focus();
      return;
    }
    if (password.length < PASSWORD_MIN) {
      $('signup-error').textContent = `Passwords need ${PASSWORD_MIN} characters or more.`;
      $('signup-password').setAttribute('aria-invalid', 'true');
      $('signup-password').focus();
      return;
    }
    if (password !== confirm) {
      $('signup-error').textContent = 'Passwords do not match.';
      $('signup-confirm').focus();
      return;
    }
    const { ok, data } = await signUp(username, password);
    if (!ok) {
      $('signup-error').textContent = (data && data.error) || 'Could not reach the room.';
      roomReject();
      return;
    }
    await afterAuthSuccess(data.username, { offerCarry: true });
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
  $('btn-reset-progress').addEventListener('click', () => resetProgress());

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

}

function startLevel(index) {
  if (GameState.isGuest && LEVELS[index].id > GUEST_MAX_LEVEL) { showLanding(); return; }
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
  $('hud-best').textContent = best !== undefined ? best.toFixed(1) + 's' : 'None';

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
  positionPuzzleLayer();
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

// Triage room integration
function startTriageRoom() {
  if (GameState.isGuest) { showLanding(); return; }
  destroyActivePuzzle();
  GameState.currentLevelIndex = LEVELS.length - 1; // triageRoom is level 13
  GameState.elapsed = 0;
  GameState.currentNotch = 0;
  GameState.isWarning = false;
  GameState.lastWarningBeep = 0;
  GameState.isPaused = false;
  GameState.displayedRoomSize = INITIAL_ROOM_SIZE;
  GameState.targetRoomSize = INITIAL_ROOM_SIZE;
  GameState.bolts = 0;
  GameState.boltsNeeded = 2;

  // Initialize triage room state using room-sim
  const triageRoom = createRoom(42); // seeded for reproducibility
  GameState.triageRoom = triageRoom;

  // Reset all stations to unsolved
  triageRoom.stations.forEach(s => { s.solved = false; s.sealed = false; });

  $('hud-level').textContent = 'Triage';
  $('hud-chapter').textContent = '';
  $('hud-best').textContent = '';

  const streakWrap = $('hud-streak-wrap');
  streakWrap.hidden = true;

  $('stage-objective').textContent = 'Triage: solve the three stations'
  $('stage-frame').classList.remove('warning');
  $('compression-fill').style.width = '0%';
  $('compression-fill').classList.remove('high');
  $('compression-fill').hidden = true;

  // Show the tagline
  $('tagline').textContent = 'Solve before the walls reach it.';
  $('tagline').hidden = false;

  switchBaseScreen('screen-game');
  positionPuzzleLayer();
  GameState.isPlaying = true;
  SFX.startBackground();

  // Position puzzle layer for triage room
  const layer = $('puzzle-layer');
  layer.innerHTML = '';
  // Render the three stations as interactive puzzle mounts
  renderTriageStations(triageRoom.stations);

  GameState.puzzleIndexInLevel = 0;
}

function renderTriageStations(stations) {
  const container = $('puzzle-layer');
  if (!container) return;

  stations.forEach((station, idx) => {
    const stationEl = document.createElement('div');
    stationEl.className = 'triage-station';
    stationEl.dataset.index = idx;
    stationEl.dataset.type = station.type;
    stationEl.innerHTML = `<span class="triage-station-label">${station.type}</span>`;
    stationEl.addEventListener('click', () => openTriageStation(idx));
    container.appendChild(stationEl);
  });
}

let openTriageStationTimeout = null;
function openTriageStation(stationIdx) {
  const station = GameState.triageRoom.stations[stationIdx];
  if (station.solved || station.sealed) return;

  // Expand station to full screen in 180 ms, no fade
  stationEl = $(`.triage-station[data-index="${stationIdx}"]`);
  if (stationEl) {
    stationEl.classList.add('expanded');
    setTimeout(() => {
      // Load the existing puzzle module
      const puzzleType = station.puzzleType || 'rotatingLock';
      const puzzleConfig = station.puzzleParams || {};
      destroyActivePuzzle();
      GameState.activePuzzle = Puzzles.create(puzzleType, puzzleConfig, $('puzzle-layer'), () => handleTriageStationSolved(stationIdx));
      const multiTag = ' · station ' + (stationIdx + 1) + '/3';
      $('stage-hint').textContent = Puzzles.hint(puzzleType) + multiTag;
    }, 180);
  }
}

function handleTriageStationSolved(stationIdx) {
  SFX.correct();
  // Mark station as solved in room-sim
  GameState.triageRoom.stations[stationIdx].solved = true;
  GameState.bolts++;

  // Push walls back by 8 percent
  const shrinkAmount = GameState.targetRoomSize * 0.08;
  GameState.targetRoomSize = Math.min(INITIAL_ROOM_SIZE, GameState.targetRoomSize + shrinkAmount);

  // Check win condition
  if (GameState.bolts >= GameState.boltsNeeded) {
    handleLevelComplete();
    return;
  }

  // Close station and return to room
  const stationEl = $(`.triage-station[data-index="${stationIdx}"]`);
  if (stationEl) stationEl.classList.remove('expanded');

  // Remove puzzle and restore room
  destroyActivePuzzle();
  // Continue showing the room with remaining stations
  renderTriageStations(GameState.triageRoom.stations);
  $('stage-hint').textContent = '';
}

function tryWrongAnswerTriage() {
  // Pull walls in by 3 percent with hard step and thud
  const penaltyAmount = GameState.targetRoomSize * 0.03;
  GameState.targetRoomSize = Math.max(MIN_ROOM_SIZE, GameState.targetRoomSize - penaltyAmount);

  // Thud sound
  SFX.wrong();

  // If room reaches minimum size, game over
  if (GameState.targetRoomSize <= MIN_ROOM_SIZE) {
    GameState.isPlaying = false;
    GameState.combo = 0;
    destroyActivePuzzle();
    SFX.stopBackground();
    SFX.gameOver();
    $('game-over-time').textContent = GameState.elapsed.toFixed(1);
    $('game-over-tip').textContent = GAME_OVER_TIPS[Math.floor(Math.random() * GAME_OVER_TIPS.length)];
    showOverlay('screen-game-over');
  }
}

function updateTriageRoom(dt) {
  if (!GameState.isPlaying || !GameState.triageRoom) return;

  // Simulate room shrinking using room-sim
  const deltaMs = dt * 1000;
  simulateRoom(GameState.triageRoom, deltaMs);

  // Update target room size based on simulation
  GameState.targetRoomSize = Math.max(MIN_ROOM_SIZE, GameState.triageRoom.roomSize);

  // Check for station sealing (wall reaching station)
  GameState.triageRoom.stations.forEach((station, idx) => {
    if (!station.solved && !station.sealed) {
      // Check if wall has reached this station
      const distance = Math.abs(station.x * GameState.targetRoomSize - 0); // simplified check
      if (distance < 20) { // station is near wall edge
        station.sealed = true;
        GameState.triageRoom.crushed++;
        SFX.shrink(); // crush sound
        // Station is now sealed, cannot be opened
        const stationEl = $(`.triage-station[data-index="${idx}"]`);
        if (stationEl) {
          stationEl.classList.add('sealed');
          // Short crush animation
          setTimeout(() => {
            stationEl.classList.add('crushed');
          }, 40);
        }
      }
    }
  });

  // Check win condition: 2 of 3 bolts
  if (GameState.bolts >= GameState.boltsNeeded) {
    handleLevelComplete();
    return;
  }

  // Check lose condition: room at minimum size
  if (GameState.triageRoom.roomSize <= MIN_ROOM_SIZE) {
    GameState.isPlaying = false;
    GameState.combo = 0;
    destroyActivePuzzle();
    SFX.stopBackground();
    SFX.gameOver();
    $('game-over-time').textContent = GameState.elapsed.toFixed(1);
    $('game-over-tip').textContent = GAME_OVER_TIPS[Math.floor(Math.random() * GAME_OVER_TIPS.length)];
    showOverlay('screen-game-over');
  }
}


// Hook into the game loop
function gameLoopTick(timestamp) {
  if (!GameState.lastTimestamp) GameState.lastTimestamp = timestamp;
  let dt = (timestamp - GameState.lastTimestamp) / 1000;
  GameState.lastTimestamp = timestamp;
  dt = Math.min(dt, 0.1);

  if (GameState.isPlaying && !GameState.isPaused) {
    if (GameState.triageRoom) {
      updateTriageRoom(dt);
    } else {
      updateGameplay(dt);
    }
    GameState.displayedRoomSize += (GameState.targetRoomSize - GameState.displayedRoomSize) * Math.min(1, dt * 6);
    updateShakeState(dt);
  }
  updateCompressionFromRoom();
  updateParticles(dt);
  positionPuzzleLayer();
  renderCanvas();

  requestAnimationFrame(gameLoopTick);
}

// Add CSS for triage stations
const style = document.createElement('style');
style.textContent = `
.triage-station {
  position: absolute;
  width: 40px;
  height: 40px;
  background: var(--bone);
  border: var(--edge);
  border-radius: var(--radius-panel);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--t2);
  cursor: pointer;
  transition: background 0.2s;
  z-index: 10;
}
.triage-station:hover { background: var(--ink); color: var(--bone); }
.triage-station.expanded { width: 120px; height: 120px; font-size: var(--t3); }
.triage-station.sealed { background: var(--signal); color: var(--bone); pointer-events: none; }
.triage-station.sealed::after { content: '✕'; display: block; width: 100%; height: 120px; line-height: 120px; text-align: center; }
`;
document.head.appendChild(style);


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
  fireSolveFlash(RoomRender.COLOR.ink, isLastPuzzleInLevel);
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
  // Guests stop at the end of chapter one. Everything past it needs an account.
  if (GameState.isGuest) {
    persisted.unlockedLevel = Math.min(persisted.unlockedLevel, GUEST_MAX_LEVEL);
  }

  const effectiveLimit = getEffectiveTimeLimit(level);
  if (timeTaken <= effectiveLimit * 0.6) GameState.combo++;
  else GameState.combo = 0;

  persisted.stats.roomsCleared++;
  persisted.stats.bestStreak = Math.max(persisted.stats.bestStreak, GameState.combo);
  persisted.stats.totalPlayTime = (persisted.stats.totalPlayTime || 0) + timeTaken;

  savePersisted();

  $('complete-room-name').textContent = level.name;
  $('complete-time').textContent = timeTaken.toFixed(1);
  $('complete-combo').textContent = GameState.combo;
  $('complete-record').hidden = !isNewRecord;

  const guestEnd = GameState.isGuest && level.id >= GUEST_MAX_LEVEL;
  const nextBtn = $('btn-next-level');
  $('complete-guest').hidden = !guestEnd;
  if (guestEnd) nextBtn.textContent = 'Create an account';
  else if (level.id >= LEVELS.length) nextBtn.textContent = 'See results';
  else nextBtn.textContent = 'Next room';

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


function renderCanvas() {
  const canvas = $('game-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const level = GameState.isPlaying || GameState.baseScreen === 'screen-game' ? getCurrentLevelData() : LEVELS[0];

  ctx.clearRect(0, 0, W, H);
  RoomRender.drawRoom(ctx, {
    width: W,
    height: H,
    size: GameState.displayedRoomSize,
    targetSize: GameState.targetRoomSize,
    initialSize: level.initialRoomSize,
    crushSize: level.crushRoomSize,
    notches: level.shrinkNotches,
    closed: GameState.currentNotch,
    warning: GameState.isWarning && GameState.isPlaying,
  });
  drawParticles(ctx);
}

function gameLoopTick(timestamp) {
  if (!GameState.lastTimestamp) GameState.lastTimestamp = timestamp;
  let dt = (timestamp - GameState.lastTimestamp) / 1000;
  GameState.lastTimestamp = timestamp;
  dt = Math.min(dt, 0.1);

  if (GameState.isPlaying && !GameState.isPaused) {
    updateGameplay(dt);
    GameState.displayedRoomSize += (GameState.targetRoomSize - GameState.displayedRoomSize) * Math.min(1, dt * 6);
    updateShakeState(dt);
  }
  updateCompressionFromRoom();
  updateParticles(dt);
  positionPuzzleLayer();
  renderCanvas();

  requestAnimationFrame(gameLoopTick);
}

function switchAuthTab(tab) {
  GameState.authTab = tab;
  $('tab-signin').setAttribute('aria-selected', String(tab === 'signin'));
  $('tab-signup').setAttribute('aria-selected', String(tab === 'signup'));
  $('panel-signin').hidden = tab !== 'signin';
  $('panel-signup').hidden = tab !== 'signup';
  $('signin-error').textContent = '';
  $('signup-error').textContent = '';
}

async function afterAuthSuccess(username, options) {
  const opts = options || {};
  GameState.username = username;
  GameState.isGuest = false;
  switchBaseScreen('screen-loading');
  persisted = await fetchProgress();
  applyPersistedSettings();
  renderLevelGrid();
  updateMenuStats();
  if (opts.offerCarry && hasGuestSave()) { showCarryPrompt(); return; }
  finishAuthNavigation();
}

function showCarryPrompt() {
  const count = Object.keys(guestChapterOneTimes()).length;
  $('carry-body').textContent = count === 1
    ? 'You cleared one room as a guest. Carrying it over keeps that best time.'
    : `You cleared ${count} rooms as a guest. Carrying them over keeps those best times.`;
  showOverlay('screen-carry');
}

async function decideCarry(carry) {
  hideOverlay('screen-carry');
  if (carry) {
    const times = guestChapterOneTimes();
    if (Object.keys(times).length) {
      const { ok } = await apiFetch('/api/progress/import-guest', {
        method: 'POST',
        body: JSON.stringify({ bestTimes: times }),
      });
      if (ok) {
        persisted = await fetchProgress();
        applyPersistedSettings();
        renderLevelGrid();
        updateMenuStats();
        clearGuestSave();
      }
    } else {
      clearGuestSave();
    }
  } else {
    clearGuestSave();
  }
  updateGuestEntry();
  finishAuthNavigation();
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
  $('btn-tutorial-next').textContent = isLast ? 'Start the first room' : 'Next';
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
  $('btn-sound-toggle').textContent = persisted.soundOn ? 'Sound on' : 'Sound off';
  $('btn-sound-toggle').setAttribute('aria-pressed', String(persisted.soundOn));
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
  positionPuzzleLayer();
  requestAnimationFrame(gameLoopTick);

  switchBaseScreen('screen-landing');
  setAuthChecking(true);
  startPreviews();

  const existingUser = await fetchMe();
  if (existingUser) {
    await afterAuthSuccess(existingUser);
    return;
  }
  setAuthChecking(false);
  updateGuestEntry();
  startPreviews();
}

document.addEventListener('DOMContentLoaded', initGame);

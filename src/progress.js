// src/progress.js
// Per-user game progress: best times, unlocked levels/themes, stats,
// settings. Loaded on sign-in, saved after every meaningful game event.

const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();

function rowToProgress(row) {
  return {
    bestTimes: JSON.parse(row.best_times),
    unlockedLevel: row.unlocked_level,
    unlockedThemes: JSON.parse(row.unlocked_themes),
    currentTheme: row.current_theme,
    difficulty: row.difficulty,
    soundOn: !!row.sound_on,
    motionReduced: !!row.motion_reduced,
    hasSeenTutorial: !!row.has_seen_tutorial,
    hasSeenIntro: !!row.has_seen_intro,
    stats: JSON.parse(row.stats),
  };
}

router.get('/', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM progress WHERE user_id = ?').get(req.user.sub);
  if (!row) return res.status(404).json({ error: 'No progress found for this account.' });
  res.json(rowToProgress(row));
});

router.put('/', requireAuth, (req, res) => {
  const p = req.body || {};
  const stmt = db.prepare(`
    UPDATE progress SET
      best_times = ?, unlocked_level = ?, unlocked_themes = ?,
           current_theme = ?, difficulty = ?, sound_on = ?, motion_reduced = ?, has_seen_tutorial = ?, has_seen_intro = ?, stats = ?, updated_at = ?
    WHERE user_id = ?
  `);
  stmt.run(
    JSON.stringify(p.bestTimes || {}),
    Number(p.unlockedLevel) || 1,
    JSON.stringify(p.unlockedThemes || ['amber']),
    p.currentTheme || 'amber',
    p.difficulty || 'normal',
    p.soundOn === false ? 0 : 1,
    p.motionReduced ? 1 : 0,
    p.hasSeenTutorial ? 1 : 0,
    p.hasSeenIntro ? 1 : 0,
    JSON.stringify(p.stats || { puzzlesSolved: 0, roomsCleared: 0, bestStreak: 0 }),
    Date.now(),
    req.user.sub
  );
  res.json({ ok: true });
});

// Carrying a guest save over. The browser sends best times; the server decides
// what they are allowed to contain. Chapter one only, plausible durations only,
// and never a lower time than the account already has.
const CHAPTER_ONE_IDS = [1, 2];
const MIN_PLAUSIBLE_TIME = 1;
const MAX_PLAUSIBLE_TIME = 600;

router.post('/import-guest', requireAuth, (req, res) => {
  const body = req.body || {};
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'bestTimes') {
    return res.status(400).json({ error: 'That guest save could not be read.' });
  }
  const source = body.bestTimes;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return res.status(400).json({ error: 'That guest save could not be read.' });
  }

  const entries = Object.entries(source);
  if (entries.length === 0 || entries.length > CHAPTER_ONE_IDS.length) {
    return res.status(400).json({ error: 'That guest save could not be read.' });
  }

  const accepted = {};
  for (const [key, raw] of entries) {
    const id = Number(key);
    const time = Number(raw);
    if (!Number.isInteger(id) || !CHAPTER_ONE_IDS.includes(id)) {
      return res.status(400).json({ error: 'Guest saves only cover chapter one.' });
    }
    if (!Number.isFinite(time) || time < MIN_PLAUSIBLE_TIME || time > MAX_PLAUSIBLE_TIME) {
      return res.status(400).json({ error: 'That guest save could not be read.' });
    }
    accepted[id] = Math.round(time * 10) / 10;
  }

  const row = db.prepare('SELECT best_times, unlocked_level FROM progress WHERE user_id = ?').get(req.user.sub);
  if (!row) return res.status(404).json({ error: 'No progress found for this account.' });

  const best = JSON.parse(row.best_times);
  for (const [id, time] of Object.entries(accepted)) {
    const previous = best[id];
    if (previous === undefined || time < previous) best[id] = time;
  }

  const cleared = CHAPTER_ONE_IDS.filter((id) => best[id] !== undefined);
  const unlockFloor = cleared.length ? Math.max(...cleared) + 1 : 1;
  const unlocked = Math.max(row.unlocked_level, Math.min(unlockFloor, CHAPTER_ONE_IDS[CHAPTER_ONE_IDS.length - 1] + 1));

  db.prepare('UPDATE progress SET best_times = ?, unlocked_level = ?, updated_at = ? WHERE user_id = ?')
    .run(JSON.stringify(best), unlocked, Date.now(), req.user.sub);

  res.json({ ok: true, bestTimes: best, unlockedLevel: unlocked });
});

router.post('/reset', requireAuth, (req, res) => {
  const stmt = db.prepare(`
    UPDATE progress SET
      best_times = '{}', unlocked_level = 1, unlocked_themes = '["amber"]',
      current_theme = 'amber', stats = '{"puzzlesSolved":0,"roomsCleared":0,"bestStreak":0}', updated_at = ?
    WHERE user_id = ?
  `);
  // Deliberately leaves difficulty, sound_on, motion_reduced, and
  // has_seen_tutorial untouched - resetting progress means starting the
  // rooms over, not making someone sit through the tutorial and re-pick
  // their settings again.
  stmt.run(Date.now(), req.user.sub);
  res.json({ ok: true });
});

module.exports = router;
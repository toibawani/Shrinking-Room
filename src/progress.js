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
           current_theme = ?, difficulty = ?, sound_on = ?, motion_reduced = ?, has_seen_tutorial = ?, stats = ?, updated_at = ?
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
    JSON.stringify(p.stats || { puzzlesSolved: 0, roomsCleared: 0, bestStreak: 0 }),
    Date.now(),
    req.user.sub
  );
    res.json({ ok: true });
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
// src/progress.js
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');
const { z, validate } = require('./validate');

const router = express.Router();

const THEMES = ['amber', 'cyan', 'violet', 'emerald'];
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const MAX_LEVEL = 12;
const MAX_TIME = 3600;

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

const progressSchema = z.object({
  bestTimes: z.record(
    z.string().regex(/^(1[0-2]|[1-9])$/),
    z.number().min(0).max(MAX_TIME)
  ).optional(),
  unlockedLevel: z.number().int().min(1).max(MAX_LEVEL).optional(),
  unlockedThemes: z.array(z.enum(THEMES)).optional(),
  currentTheme: z.enum(THEMES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  soundOn: z.boolean().optional(),
  motionReduced: z.boolean().optional(),
  hasSeenTutorial: z.boolean().optional(),
  hasSeenIntro: z.boolean().optional(),
  stats: z.object({
    puzzlesSolved: z.number().int().min(0).optional(),
    roomsCleared: z.number().int().min(0).optional(),
    bestStreak: z.number().int().min(0).optional(),
    totalPlayTime: z.number().min(0).optional(),
  }).strict().optional(),
}).strict();

router.get('/', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM progress WHERE user_id = ?').get(req.user.sub);
  if (!row) return res.status(404).json({ error: 'No progress found for this account.' });
  res.json(rowToProgress(row));
});

router.put('/', requireAuth, validate(progressSchema), (req, res, next) => {
  try {
    const p = req.body || {};
    const existingRow = db.prepare('SELECT * FROM progress WHERE user_id = ?').get(req.user.sub);
    if (!existingRow) return res.status(404).json({ error: 'No progress found for this account.' });
    const existing = rowToProgress(existingRow);

    const newUnlocked = p.unlockedLevel !== undefined ? p.unlockedLevel : existing.unlockedLevel;
    if (newUnlocked > existing.unlockedLevel + 1) {
      return res.status(400).json({ error: 'Invalid progress update.' });
    }

    const newBestTimes = p.bestTimes !== undefined ? p.bestTimes : existing.bestTimes;
    for (const key of Object.keys(newBestTimes)) {
      const lvl = Number(key);
      if (!Number.isInteger(lvl) || lvl < 1 || lvl > MAX_LEVEL) {
        return res.status(400).json({ error: 'Invalid progress update.' });
      }
      if (lvl > newUnlocked) {
        return res.status(400).json({ error: 'Invalid progress update.' });
      }
    }

    const newThemes = p.unlockedThemes !== undefined ? p.unlockedThemes : existing.unlockedThemes;
    if (!newThemes.includes('amber')) {
      return res.status(400).json({ error: 'Invalid progress update.' });
    }
    const newCurrentTheme = p.currentTheme !== undefined ? p.currentTheme : existing.currentTheme;
    if (!newThemes.includes(newCurrentTheme)) {
      return res.status(400).json({ error: 'Invalid progress update.' });
    }

    const mergedStats = { ...existing.stats, ...(p.stats || {}) };

    const stmt = db.prepare(`
      UPDATE progress SET
        best_times = ?, unlocked_level = ?, unlocked_themes = ?,
             current_theme = ?, difficulty = ?, sound_on = ?, motion_reduced = ?, has_seen_tutorial = ?, has_seen_intro = ?, stats = ?, updated_at = ?
      WHERE user_id = ?
    `);
    stmt.run(
      JSON.stringify(newBestTimes),
      newUnlocked,
      JSON.stringify(newThemes),
      newCurrentTheme,
      p.difficulty !== undefined ? p.difficulty : existing.difficulty,
      (p.soundOn !== undefined ? p.soundOn : existing.soundOn) ? 1 : 0,
      (p.motionReduced !== undefined ? p.motionReduced : existing.motionReduced) ? 1 : 0,
      (p.hasSeenTutorial !== undefined ? p.hasSeenTutorial : existing.hasSeenTutorial) ? 1 : 0,
      (p.hasSeenIntro !== undefined ? p.hasSeenIntro : existing.hasSeenIntro) ? 1 : 0,
      JSON.stringify(mergedStats),
      Date.now(),
      req.user.sub
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/reset', requireAuth, (req, res) => {
  const stmt = db.prepare(`
    UPDATE progress SET
      best_times = '{}', unlocked_level = 1, unlocked_themes = '["amber"]',
      current_theme = 'amber', stats = '{"puzzlesSolved":0,"roomsCleared":0,"bestStreak":0,"totalPlayTime":0}', updated_at = ?
    WHERE user_id = ?
  `);
  stmt.run(Date.now(), req.user.sub);
  res.json({ ok: true });
});

module.exports = router;

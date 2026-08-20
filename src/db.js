// src/db.js
// SQLite via Node's built-in node:sqlite (Node 22.5+, no native build step).
// The database file lives in data/, which is gitignored — every install
// starts with a clean, empty database.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'shrinkingroom.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    best_times TEXT NOT NULL DEFAULT '{}',
    unlocked_level INTEGER NOT NULL DEFAULT 1,
    unlocked_themes TEXT NOT NULL DEFAULT '["amber"]',
    current_theme TEXT NOT NULL DEFAULT 'amber',
    difficulty TEXT NOT NULL DEFAULT 'normal',
       sound_on INTEGER NOT NULL DEFAULT 1,
    motion_reduced INTEGER NOT NULL DEFAULT 0,
    has_seen_tutorial INTEGER NOT NULL DEFAULT 0,
    stats TEXT NOT NULL DEFAULT '{"puzzlesSolved":0,"roomsCleared":0,"bestStreak":0}',
    updated_at INTEGER NOT NULL
  );
`);

// CREATE TABLE IF NOT EXISTS only handles brand-new databases - anyone who
// already ran the app before this column existed needs it added on top of
// their real data/shrinkingroom.db. ALTER TABLE ADD COLUMN throws if the
// column is already there, so this only ever runs once per database.
try {
  db.exec('ALTER TABLE progress ADD COLUMN motion_reduced INTEGER NOT NULL DEFAULT 0');
} catch (e) {
  // column already exists - nothing to do
}

module.exports = db;
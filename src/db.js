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
    stats TEXT NOT NULL DEFAULT '{"puzzlesSolved":0,"roomsCleared":0,"bestStreak":0}',
    updated_at INTEGER NOT NULL
  );
`);

module.exports = db;

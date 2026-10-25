// src/auth.js
// Signup / login / logout / me. Passwords are hashed with bcrypt, never
// stored or logged in plaintext. Sessions are a JWT in an httpOnly cookie,
// so client-side JS can never read the token directly.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-in-production';
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using an insecure dev default. Set a real one before deploying anywhere public.');
}

const COOKIE_NAME = 'sr_session';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

const USERNAME_MIN = 3;
const USERNAME_MAX = 24;
const USERNAME_CHARS_RE = /^[A-Za-z0-9_]+$/;
// Existing accounts keep working: this rule only applies when a password is
// chosen. Sign-in never checks length.
const PASSWORD_MIN = 10;

// Usernames are stored and looked up in one canonical form, so "Ada" and
// "ada" are the same account on both register and login.
function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

// Returns the message to show the player, or null when the name is valid.
// Never truncates: an over-long name is rejected, not quietly cut to fit.
function usernameProblem(username) {
  if (!username) return `Username must be ${USERNAME_MIN} to ${USERNAME_MAX} characters.`;
  if (username.includes('@')) return 'Use your username, not an email.';
  if (username.length < USERNAME_MIN) return `Username must be at least ${USERNAME_MIN} characters.`;
  if (username.length > USERNAME_MAX) return `Username must be ${USERNAME_MAX} characters or fewer.`;
  if (!USERNAME_CHARS_RE.test(username)) return 'Username can use letters, numbers, and underscores only.';
  return null;
}

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

router.post('/signup', (req, res) => {
  const { username: rawUsername, password } = req.body || {};
  const username = typeof rawUsername === 'string' ? normalizeUsername(rawUsername) : '';

  const problem = usernameProblem(username);
  if (problem) {
    return res.status(400).json({ error: problem });
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
  }

  const existing = db.prepare('SELECT id FROM users WHERE lower(username) = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const now = Date.now();
  const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, passwordHash, now);
  const userId = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO progress (user_id, updated_at) VALUES (?, ?)').run(userId, now);

  issueSession(res, { id: userId, username });
  res.status(201).json({ username });
});

router.post('/login', (req, res) => {
  const { username: rawUsername, password } = req.body || {};
  const username = typeof rawUsername === 'string' ? normalizeUsername(rawUsername) : '';
  if (!username || typeof password !== 'string') {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }

  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE lower(username) = ?').get(username);
  // Deliberately generic error message either way, so we don't leak which
  // usernames exist (basic protection against account enumeration).
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }

  issueSession(res, user);
  res.json({ username: user.username });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

module.exports = router;
module.exports.requireAuth = requireAuth;

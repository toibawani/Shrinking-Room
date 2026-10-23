const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const config = require('./config');
const { z, validate } = require('./validate');

const router = express.Router();

const JWT_SECRET = config.jwtSecret;
const COOKIE_NAME = 'sr_session';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: config.cookieSecure,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

const signupSchema = z.object({
  username: z.string().regex(USERNAME_RE, '3-16 characters: letters, numbers, and underscores only.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
}).strict();

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
}).strict();

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
    res.clearCookie(COOKIE_NAME, COOKIE_OPTS);
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

router.post('/signup', validate(signupSchema), (req, res, next) => {
  try {
    const { username, password } = req.body;
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Invalid username or password.' });
    }
    const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);
    const now = Date.now();
    const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, passwordHash, now);
    const userId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO progress (user_id, updated_at) VALUES (?, ?)').run(userId, now);
    issueSession(res, { id: userId, username });
    res.status(201).json({ username });
  } catch (e) { next(e); }
});

router.post('/login', validate(loginSchema), (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    issueSession(res, user);
    res.json({ username: user.username });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTS);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

module.exports = router;
module.exports.requireAuth = requireAuth;

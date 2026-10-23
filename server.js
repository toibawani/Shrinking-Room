const config = require('./src/config');

const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./src/auth');
const progressRoutes = require('./src/progress');

const app = express();

if (config.isProd) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
  hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

// CORS: reflect origin only if allowlisted.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Origin check on state-changing routes.
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
  }
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const progressLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/progress', progressLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);

app.use(express.static(path.join(__dirname, 'public')));

// Central error handler — never leak internals.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && err.name === 'ZodError') {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  const status = err && err.status ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: 'Something went wrong.' });
});

app.listen(config.port, () => {
  console.log(`Shrinking Room listening on http://localhost:${config.port}`);
});

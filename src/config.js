// src/config.js
// Central configuration from environment. Fails fast on missing required
// values so the server never boots in an insecure state.

const isProd = process.env.NODE_ENV === 'production';

function required(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`[config] Missing required env var ${name}. Refusing to start.`);
    process.exit(1);
  }
  return String(v).trim();
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT) || 3000,
  jwtSecret: required('JWT_SECRET'),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  cookieSecure: isProd,
};

if (config.allowedOrigins.length === 0 && !isProd) {
  config.allowedOrigins = [`http://localhost:${config.port}`];
}

module.exports = config;

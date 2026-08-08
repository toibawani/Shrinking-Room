// server.js
// Express entry point. Serves the game from public/ and mounts the API.
// Run with: npm install && npm start

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./src/auth');
const progressRoutes = require('./src/progress');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);

app.listen(PORT, () => {
  console.log(`Shrinking Room running at http://localhost:${PORT}`);
});

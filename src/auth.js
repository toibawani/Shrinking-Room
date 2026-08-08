// src/auth.js
// Placeholder auth routes. Real signup/login land in the next commit.
const express = require('express');
const router = express.Router();

router.get('/me', (req, res) => {
  res.status(401).json({ error: 'not implemented yet' });
});

module.exports = router;

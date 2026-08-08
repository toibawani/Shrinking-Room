// src/progress.js
// Placeholder progress routes. Real persistence lands in a later commit.
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.status(401).json({ error: 'not implemented yet' });
});

module.exports = router;

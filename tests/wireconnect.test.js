const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WireConnect, wcVerifyBoard } = require('../public/puzzles.js');

test('WireConnect boards are solvable', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const state = WireConnect.generate({ pairs: 3, gridSize: 5, seed });
    assert.equal(state.gridSize, 5);
    assert.equal(state.pairs, 3);
    const ok = wcVerifyBoard(state);
    assert.ok(ok !== false, `seed ${seed}: board not verified`);
    let endpoints = 0;
    for (let r = 0; r < state.gridSize; r++)
      for (let c = 0; c < state.gridSize; c++)
        if (state.cells[r][c].kind === 'endpoint') endpoints++;
    assert.equal(endpoints, state.pairs * 2, `seed ${seed}: endpoint count`);
  }
});

test('wcVerifyBoard rejects null', () => {
  assert.equal(wcVerifyBoard(null), false);
});
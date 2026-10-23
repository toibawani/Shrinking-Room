#!/usr/bin/env node
const { WireConnect } = require('../public/puzzles.js');
const { LEVELS } = require('../public/levels.js');

const args = process.argv.slice(2);
let perRoom = 100000;
for (const a of args) {
  const m = a.match(/^--seeds=(\d+)$/);
  if (m) perRoom = Number(m[1]);
}

const wireRooms = [];
for (const level of LEVELS) {
  for (const pz of level.puzzles || []) {
    if (pz.type === 'wireConnect') {
      wireRooms.push({ levelId: level.id, name: level.name, params: pz.params });
    }
  }
}

function solveBoard(board) {
  const grid = board.cells;
  const n = board.gridSize;
  const owner = new Map();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = grid[r][c];
      if (!cell || cell.kind === 'blocked') continue;
      const key = r + ',' + c;
      if (owner.has(key)) return false;
      owner.set(key, cell.pair);
    }
  }
  for (let i = 0; i < board.pairs; i++) {
    const [a, b] = board.endpoints[i];
    const seen = new Set();
    const q = [a[0] + ',' + a[1]];
    seen.add(q[0]);
    let found = false;
    while (q.length) {
      const cur = q.shift();
      if (cur === b[0] + ',' + b[1]) { found = true; break; }
      const [r, c] = cur.split(',').map(Number);
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const cell = grid[nr][nc];
        if (!cell || cell.pair !== i) continue;
        if (cell.kind !== 'endpoint' && cell.kind !== 'corridor') continue;
        const k = nr + ',' + nc;
        if (seen.has(k)) continue;
        seen.add(k);
        q.push(k);
      }
    }
    if (!found) return false;
  }
  return true;
}

let total = 0;
let unsolvable = 0;
for (const room of wireRooms) {
  let roomFails = 0;
  for (let i = 0; i < perRoom; i++) {
    const seed = i;
    let board;
    try {
      board = WireConnect.generate({ gridSize: room.params.gridSize, pairs: room.params.pairs, seed });
    } catch (e) {
      console.error('THROW level ' + room.levelId + ' seed ' + seed + ': ' + e.message);
      unsolvable++;
      roomFails++;
      continue;
    }
    if (board.pairs !== room.params.pairs) {
      console.error('FEWER PAIRS level ' + room.levelId + ' seed ' + seed);
      unsolvable++;
      roomFails++;
      continue;
    }
    if (!solveBoard(board)) {
      console.error('UNSOLVABLE level ' + room.levelId + ' (' + room.name + ') seed ' + seed);
      unsolvable++;
      roomFails++;
      if (unsolvable >= 5) process.exit(1);
    }
    total++;
  }
  console.log(room.name + ' (level ' + room.levelId + '): ' + perRoom + ' seeds, ' + roomFails + ' failures');
}

console.log('Total boards checked: ' + total + ', unsolvable: ' + unsolvable);
if (unsolvable > 0) process.exit(1);
process.exit(0);

// levels.js
// All 12 rooms. Most have one puzzle; the last two chain two puzzle types
// back to back on the same timer for a harder finale.

const LEVELS = [
  { id: 1, name: 'First Light', timeLimit: 24, shrinkNotches: 4, initialRoomSize: 520, crushRoomSize: 190,
    puzzles: [{ type: 'patternCompletion', params: { length: 3, options: 3, complexity: 1 } }] },
  { id: 2, name: 'Six of One', timeLimit: 22, shrinkNotches: 4, initialRoomSize: 500, crushRoomSize: 185,
    puzzles: [{ type: 'hiddenKey', params: { decoys: 5, difficulty: 0.30 } }] },
  { id: 3, name: 'Steady Hands', timeLimit: 22, shrinkNotches: 4, initialRoomSize: 500, crushRoomSize: 180,
    puzzles: [{ type: 'symbolMemory', params: { slots: 5, sequenceLength: 3, showTime: 650, gapTime: 250 } }] },
  { id: 4, name: 'Counterweight', timeLimit: 22, shrinkNotches: 5, initialRoomSize: 490, crushRoomSize: 180,
    puzzles: [{ type: 'weightBalance', params: { objectCount: 5, maxValue: 9 } }] },
  { id: 5, name: 'Two Truths', timeLimit: 20, shrinkNotches: 5, initialRoomSize: 480, crushRoomSize: 175,
    puzzles: [{ type: 'rotatingLock', params: { dials: 2, segments: 6, linked: false } }] },
  { id: 6, name: 'Crossed Wires', timeLimit: 20, shrinkNotches: 5, initialRoomSize: 480, crushRoomSize: 175,
    puzzles: [{ type: 'wireConnect', params: { gridSize: 4, pairs: 2 } }] },
  { id: 7, name: 'Echoes', timeLimit: 18, shrinkNotches: 5, initialRoomSize: 470, crushRoomSize: 170,
    puzzles: [{ type: 'patternCompletion', params: { length: 4, options: 4, complexity: 2 } }] },
  { id: 8, name: 'Almost Identical', timeLimit: 17, shrinkNotches: 5, initialRoomSize: 460, crushRoomSize: 165,
    puzzles: [{ type: 'hiddenKey', params: { decoys: 8, difficulty: 0.60 } }] },
  { id: 9, name: 'Long Memory', timeLimit: 17, shrinkNotches: 6, initialRoomSize: 460, crushRoomSize: 165,
    puzzles: [{ type: 'symbolMemory', params: { slots: 7, sequenceLength: 5, showTime: 500, gapTime: 200 } }] },
  { id: 10, name: 'Chain Reaction', timeLimit: 16, shrinkNotches: 6, initialRoomSize: 450, crushRoomSize: 160,
    puzzles: [{ type: 'rotatingLock', params: { dials: 3, segments: 8, linked: true } }] },
  { id: 11, name: 'Double Trouble', timeLimit: 27, shrinkNotches: 6, initialRoomSize: 480, crushRoomSize: 165,
    puzzles: [
      { type: 'wireConnect', params: { gridSize: 5, pairs: 3 } },
      { type: 'weightBalance', params: { objectCount: 6, maxValue: 12 } },
    ] },
  { id: 12, name: 'The Last Room', timeLimit: 25, shrinkNotches: 7, initialRoomSize: 460, crushRoomSize: 150,
    puzzles: [
      { type: 'symbolMemory', params: { slots: 8, sequenceLength: 6, showTime: 420, gapTime: 180 } },
      { type: 'rotatingLock', params: { dials: 3, segments: 8, linked: true } },
    ] },
];

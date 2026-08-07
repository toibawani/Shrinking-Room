// levels.js
// Level data: each entry controls timing, room size, and which puzzle(s)
// to solve. More levels get added as puzzle types come online.

const LEVELS = [
  {
    id: 1, name: 'First Light',
    timeLimit: 24, shrinkNotches: 4, initialRoomSize: 520, crushRoomSize: 190,
    puzzles: [{ type: 'patternCompletion', params: { length: 3, options: 3, complexity: 1 } }],
  },
  {
    id: 2, name: 'Six of One',
    timeLimit: 22, shrinkNotches: 4, initialRoomSize: 500, crushRoomSize: 185,
    puzzles: [{ type: 'hiddenKey', params: { decoys: 5, difficulty: 0.30 } }],
  },
  {
    id: 3, name: 'Steady Hands',
    timeLimit: 22, shrinkNotches: 4, initialRoomSize: 500, crushRoomSize: 180,
    puzzles: [{ type: 'symbolMemory', params: { slots: 5, sequenceLength: 3, showTime: 650, gapTime: 250 } }],
  },
  {
    id: 4, name: 'Counterweight',
    timeLimit: 22, shrinkNotches: 5, initialRoomSize: 490, crushRoomSize: 180,
    puzzles: [{ type: 'weightBalance', params: { objectCount: 5, maxValue: 9 } }],
  },
];

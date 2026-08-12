// levels.js
// All 12 rooms. Rebalanced for a harder ramp than the original version:
// timers are tighter throughout, and combined (2-puzzle) rooms now start
// at room 9 instead of only the last two, so the back half sustains real
// pressure instead of just getting a longer single puzzle.
//
// Word Forge (7th puzzle type) is woven in at three points - an easy
// solo introduction at room 4, then twice more at increasing difficulty
// in the combined finale rooms, so its own difficulty ramps too, not
// just the room around it.

const LEVELS = [
  { id: 1, name: 'First Light', timeLimit: 23, shrinkNotches: 4, initialRoomSize: 520, crushRoomSize: 190,
    puzzles: [{ type: 'patternCompletion', params: { length: 3, options: 3, complexity: 1 } }] },
  { id: 2, name: 'Six of One', timeLimit: 20, shrinkNotches: 4, initialRoomSize: 500, crushRoomSize: 182,
    puzzles: [{ type: 'hiddenKey', params: { decoys: 5, difficulty: 0.30 } }] },
  { id: 3, name: 'Steady Hands', timeLimit: 19, shrinkNotches: 4, initialRoomSize: 495, crushRoomSize: 178,
    puzzles: [{ type: 'symbolMemory', params: { slots: 5, sequenceLength: 3, showTime: 600, gapTime: 220 } }] },
  { id: 4, name: 'First Words', timeLimit: 22, shrinkNotches: 4, initialRoomSize: 490, crushRoomSize: 178,
    puzzles: [{ type: 'wordForge', params: { wordsNeeded: 2, minLength: 3 } }] },
  { id: 5, name: 'Two Truths', timeLimit: 18, shrinkNotches: 5, initialRoomSize: 475, crushRoomSize: 172,
    puzzles: [{ type: 'rotatingLock', params: { dials: 2, segments: 6, linked: false } }] },
  { id: 6, name: 'Crossed Wires', timeLimit: 18, shrinkNotches: 5, initialRoomSize: 470, crushRoomSize: 170,
    puzzles: [{ type: 'wireConnect', params: { gridSize: 4, pairs: 2 } }] },
  { id: 7, name: 'Counterweight', timeLimit: 17, shrinkNotches: 5, initialRoomSize: 465, crushRoomSize: 168,
    puzzles: [{ type: 'weightBalance', params: { objectCount: 5, maxValue: 9 } }] },
  { id: 8, name: 'Echoes', timeLimit: 15, shrinkNotches: 5, initialRoomSize: 455, crushRoomSize: 162,
    puzzles: [{ type: 'patternCompletion', params: { length: 4, options: 4, complexity: 2 } }] },
  { id: 9, name: 'Almost Identical', timeLimit: 26, shrinkNotches: 6, initialRoomSize: 455, crushRoomSize: 158,
    puzzles: [
      { type: 'hiddenKey', params: { decoys: 9, difficulty: 0.65 } },
      { type: 'symbolMemory', params: { slots: 7, sequenceLength: 5, showTime: 460, gapTime: 190 } },
    ] },
  { id: 10, name: 'Word Games', timeLimit: 28, shrinkNotches: 6, initialRoomSize: 450, crushRoomSize: 155,
    puzzles: [
      { type: 'wordForge', params: { wordsNeeded: 3, minLength: 4 } },
      { type: 'rotatingLock', params: { dials: 3, segments: 8, linked: true } },
    ] },
  { id: 11, name: 'Double Trouble', timeLimit: 26, shrinkNotches: 7, initialRoomSize: 445, crushRoomSize: 150,
    puzzles: [
      { type: 'wireConnect', params: { gridSize: 5, pairs: 3 } },
      { type: 'weightBalance', params: { objectCount: 6, maxValue: 12 } },
    ] },
  { id: 12, name: 'The Last Room', timeLimit: 27, shrinkNotches: 7, initialRoomSize: 440, crushRoomSize: 145,
    puzzles: [
      { type: 'wordForge', params: { wordsNeeded: 3, minLength: 5 } },
      { type: 'rotatingLock', params: { dials: 3, segments: 9, linked: true } },
    ] },
];

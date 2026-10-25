// levels.js — 12 rooms across 8 chapters. Each chapter introduces or
// combines mechanics deliberately. Timers tighten; combined rooms start
// at room 9 so the back half sustains real pressure.

const CHAPTERS = [
  { id: 'awakening',  label: 'I',   name: 'Awakening',  tagline: 'Something is wrong with this room.' },
  { id: 'discovery',  label: 'II',  name: 'Discovery',  tagline: 'Patterns emerge from the pressure.' },
  { id: 'adaptation', label: 'III', name: 'Adaptation', tagline: 'Your hands learn faster than your mind.' },
  { id: 'pressure',   label: 'IV',  name: 'Pressure',   tagline: 'The walls no longer wait.' },
  { id: 'compression',label: 'V',   name: 'Compression',tagline: 'Less space. More at stake.' },
  { id: 'distortion', label: 'VI',  name: 'Distortion', tagline: 'Nothing is quite what it seems.' },
  { id: 'confinement',label: 'VII', name: 'Confinement',tagline: 'Two puzzles. One shrinking cell.' },
  { id: 'final',      label: 'VIII',name: 'Final Room', tagline: 'There is nowhere left to go.' },
];

const LEVELS = [
  { id: 1, chapter: 'awakening', name: 'First Light', subtitle: 'Learn the walls move on a clock.',
    timeLimit: 25, shrinkNotches: 4, initialRoomSize: 520, crushRoomSize: 190,
    puzzles: [{ type: 'patternCompletion', params: { length: 3, options: 3, complexity: 1 } }] },

  { id: 2, chapter: 'awakening', name: 'Six of One', subtitle: 'Trust your eyes, barely.',
    timeLimit: 22, shrinkNotches: 4, initialRoomSize: 500, crushRoomSize: 182,
    puzzles: [{ type: 'hiddenKey', params: { decoys: 5, difficulty: 0.28 } }] },

  { id: 3, chapter: 'discovery', name: 'Steady Hands', subtitle: 'Memory under compression.',
    timeLimit: 21, shrinkNotches: 4, initialRoomSize: 495, crushRoomSize: 178,
    puzzles: [{ type: 'symbolMemory', params: { slots: 5, sequenceLength: 3, showTime: 650, gapTime: 240 } }] },

  { id: 4, chapter: 'discovery', name: 'First Words', subtitle: 'Letters are your lifeline.',
    timeLimit: 24, shrinkNotches: 4, initialRoomSize: 490, crushRoomSize: 178,
    puzzles: [{ type: 'wordForge', params: { wordsNeeded: 2, minLength: 3 } }] },

  { id: 5, chapter: 'adaptation', name: 'Two Truths', subtitle: 'Align what does not align.',
    timeLimit: 20, shrinkNotches: 5, initialRoomSize: 475, crushRoomSize: 172,
    puzzles: [{ type: 'rotatingLock', params: { dials: 2, segments: 6, linked: false } }] },

  { id: 6, chapter: 'adaptation', name: 'Crossed Wires', subtitle: 'Route the signal before it cuts out.',
    timeLimit: 20, shrinkNotches: 5, initialRoomSize: 470, crushRoomSize: 170,
    puzzles: [{ type: 'wireConnect', params: { gridSize: 4, pairs: 2 } }] },

  { id: 7, chapter: 'pressure', name: 'Counterweight', subtitle: 'Balance is survival.',
    timeLimit: 19, shrinkNotches: 5, initialRoomSize: 465, crushRoomSize: 168,
    puzzles: [{ type: 'weightBalance', params: { objectCount: 5, maxValue: 9 } }] },

  { id: 8, chapter: 'pressure', name: 'Echoes', subtitle: 'The pattern returns, harder.',
    timeLimit: 17, shrinkNotches: 5, initialRoomSize: 455, crushRoomSize: 162,
    puzzles: [{ type: 'patternCompletion', params: { length: 4, options: 4, complexity: 2 } }] },

  { id: 9, chapter: 'compression', name: 'Almost Identical', subtitle: 'Two trials. One timer.',
    timeLimit: 28, shrinkNotches: 6, initialRoomSize: 455, crushRoomSize: 158,
    puzzles: [
      { type: 'hiddenKey', params: { decoys: 9, difficulty: 0.62 } },
      { type: 'symbolMemory', params: { slots: 7, sequenceLength: 4, showTime: 480, gapTime: 200 } },
    ] },

  { id: 10, chapter: 'distortion', name: 'Word Games', subtitle: 'Language and locks intertwined.',
    timeLimit: 30, shrinkNotches: 6, initialRoomSize: 450, crushRoomSize: 155,
    puzzles: [
      { type: 'wordForge', params: { wordsNeeded: 3, minLength: 4 } },
      { type: 'rotatingLock', params: { dials: 3, segments: 8, linked: true } },
    ] },

  { id: 11, chapter: 'confinement', name: 'Double Trouble', subtitle: 'Every second counts twice.',
    timeLimit: 28, shrinkNotches: 7, initialRoomSize: 445, crushRoomSize: 150,
    puzzles: [
      { type: 'wireConnect', params: { gridSize: 5, pairs: 3 } },
      { type: 'weightBalance', params: { objectCount: 6, maxValue: 12 } },
    ] },

  { id: 12, chapter: 'final', name: 'The Last Room', subtitle: 'End of the corridor.',
    timeLimit: 30, shrinkNotches: 7, initialRoomSize: 440, crushRoomSize: 145,
    puzzles: [
      { type: 'wordForge', params: { wordsNeeded: 3, minLength: 5 } },
      { type: 'rotatingLock', params: { dials: 3, segments: 9, linked: true } },
    ] },

  // Triage room — a single vertical slice for the new triage mechanic.
  // A square arena where walls move inward on an eased curve.
  // The room holds 3 stations at seeded positions: a lock, a wire panel,
  // and a pattern wall. Click or tap one to open it. It expands to full
  // screen in 180 ms, no fade, and runs the EXISTING puzzle module.
  // While it is open the walls KEEP MOVING. A slim strip along the screen
  // edge shows how close each wall is and which stations are in danger,
  // so the player can bail out and return to the room.
  // When a wall reaches a station, that station is sealed with a short
  // crush animation (400 ms) and can never be opened again.
  // Solving a station pushes all walls back by 8 percent of the room
  // and gives the player a bolt.
  // Every wrong answer pulls the walls in by 3 percent with a hard step
  // and a thud.
  // Win: collect 2 of 3 bolts, then click the door in the room's center.
  // Fail: the room reaches its minimum size. The door is always inside
  // the minimum size.
  // Station difficulty is shown as pips. The edge stations are easy and
  // doomed. The center station is hard and safe. That is the decision the
  // player makes, so tune the slice to make it feel like a real choice.
  // First room, one line of text only: "Solve before the walls reach it."
  // No tutorial screens.
  // Retry in under 300 ms with no modal.
  // Score is the percentage of the room left at the win.
  triageRoom: {
    id: 13,
    name: 'Triage',
    subtitle: 'Pressure test.',
    timeLimit: 30,
    initialRoomSize: 520,
    minRoomSize: 100,
    boltsNeeded: 2,
    shrinkNotches: 4,
    crushRoomSize: 190,
    // Three stations at seeded positions
    stations: [
      { type: 'lock', x: 0.25, y: 0.5, difficulty: 1, seed: 42 },
      { type: 'wirePanel', x: 0.5, y: 0.5, difficulty: 2, seed: 43 },
      { type: 'patternWall', x: 0.75, y: 0.5, difficulty: 3, seed: 44 }
    ],
    // Puzzle types for each station (reproducible from seed)
    puzzleTypes: ['rotatingLock', 'wireConnect', 'patternCompletion'],
    // UI: one line of text only
    tagline: 'Solve before the walls reach it.'
  }
];

function getChapter(chapterId) {
  return CHAPTERS.find(c => c.id === chapterId) || CHAPTERS[0];
}

function getLevelChapter(level) {
  return getChapter(level.chapter);
}
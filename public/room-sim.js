// room-sim.js — Pure deterministic module for triage room simulation.
// No canvas, no DOM. Takes a time delta and player actions, returns state.

// Room geometry constants
const MIN_ROOM_SIZE = 100; // px, minimum size before fail
const INITIAL_ROOM_SIZE = 520; // px
const CRUSH_ROOM_SIZE = 190; // px, size when stations are crushed
const WALL_SPEED = 120; // px per second (eased)
const SHRINK_DURATION = 9000; // ms, full room shrink time without notches
const NOTCH_DURATION_STEP = SHRINK_DURATION / 4; // per notch

// Bolt and penalty constants
const BOLTS_TO_WIN = 2;
const SOLVE_REWARD_PERCENT = 8;  // walls push back 8% per solve
const WRONG_PENALTY_PERCENT = 3; // walls pull in 3% per mistake

// Station types and difficulty
const StationType = {
  LOCK: 'lock',
  WIRE_PANEL: 'wirePanel',
  PATTERN_WALL: 'patternWall'
};

// Difficulty pips: edge stations are easy (1 pip), center is hard (3 pips)
const stationDifficulty = {
  [StationType.LOCK]: 1,      // edge: easy
  [StationType.WIRE_PANEL]: 2, // middle: medium
  [StationType.PATTERN_WALL]: 3 // center: hard
};

// Seed-based PRNG for reproducible room generation
class PRNG {
  constructor(seed) {
    this.state = seed !== undefined ? seed : Date.now();
  }
  next() {
    // LCG: x = 1664525 * x + 1013904223
    this.state = this.state * 1664525 + 1013904223;
    return (this.state >>> 0) / 4294967296; // [0, 1)
  }
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// Station data structure
function createStation(type, x, y, difficulty, seed) {
  const rng = new PRNG(seed);
  return {
    type,
    x, y, // position in room coordinates (0 to 1, relative to room center)
    difficulty,
    solved: false,
    sealed: false,
    // puzzle state will be set when station is opened
    puzzleType: type,
    puzzleParams: {}
  };
}

// Room state structure
function createRoom(seed) {
  const rng = new PRNG(seed);

  // Three stations positioned around the room
  // Edge stations (left and right), center station
  const stationPositions = [
    { x: 0.25, y: 0.5 },   // left edge
    { x: 0.5, y: 0.5 },    // center
    { x: 0.75, y: 0.5 }    // right edge
  ];

  const stations = stationPositions.map((pos, i) => {
    const type = i === 1 ? StationType.PATTERN_WALL : // center is pattern wall
                 i === 0 ? StationType.LOCK :           // left is lock
                 StationType.WIRE_PANEL;                // right is wire panel
    return createStation(type, pos.x, pos.y, stationDifficulty[type], seed + i);
  });

  return {
    id: seed,
    stations,
    bolts: 0,
    boltsNeeded: BOLTS_TO_WIN,
    roomSize: INITIAL_ROOM_SIZE,
    minRoomSize: MIN_ROOM_SIZE,
    crushed: 0, // how many stations have been sealed
    timeRemaining: SHRINK_DURATION, // ms
    gameOver: false,
    won: false,
    started: false,
    reducedMotion: false
  };
}

// Core simulation step - deterministic given delta time and actions
function simulateRoom(room, deltaMs, action) {
  // If game is over, no changes
  if (room.gameOver || !room.started) {
    return room;
  }

  // Update time remaining
  room.timeRemaining = Math.max(0, room.timeRemaining - deltaMs);

  // Check for win/loss conditions
  const boltsNeeded = room.boltsNeeded;
  const bolts = room.bolts;

  // Win condition: 2 bolts collected
  if (bolts >= boltsNeeded && !room.won) {
    room.won = true;
    room.gameOver = true;
    return room;
  }

  // Lose condition: room reaches minimum size
  if (room.roomSize <= MIN_ROOM_SIZE && !room.gameOver) {
    room.gameOver = true;
    room.won = false;
    return room;
  }

  // Process player action
  if (action && action.type) {
    switch (action.type) {
      case 'solveStation':
        return trySolveStation(room, action.stationIndex);
      case 'wrongAnswer':
        return tryWrongAnswer(room);
    }
  }

  // Continuous wall movement - walls move inward over time
  // The faster the room shrinks (less time remaining), the faster walls move
  const progress = 1 - room.timeRemaining / SHRINK_DURATION;
  const easedProgress = progress * progress * (3 - 2 * progress); // smoothstep
  
  // Calculate how much the walls should have moved based on time
  const maxShrink = INITIAL_ROOM_SIZE - MIN_ROOM_SIZE;
  const targetShrink = maxShrink * easedProgress;
  const currentShrink = INITIAL_ROOM_SIZE - room.roomSize;
  
  // If we've passed the target shrink, adjust room size
  if (currentShrink < targetShrink) {
    room.roomSize = Math.max(MIN_ROOM_SIZE, INITIAL_ROOM_SIZE - targetShrink);
  }

  return room;
}

// Try to solve a station
function trySolveStation(room, stationIndex) {
  const station = room.stations[stationIndex];

  // Can't solve if already solved or sealed
  if (station.solved || station.sealed) {
    return room;
  }

  // Mark station as solved
  station.solved = true;
  room.bolts = (room.bolts || 0) + 1;

  // Push walls back by 8% of room size
  const shrinkAmount = room.roomSize * 0.08;
  room.roomSize = Math.min(INITIAL_ROOM_SIZE, room.roomSize + shrinkAmount);

  // Check win condition
  if (room.bolts >= room.boltsNeeded) {
    room.won = true;
    room.gameOver = true;
  }

  return room;
}

// Try a wrong answer
function tryWrongAnswer(room) {
  // Pull walls in by 3% with hard step and thud
  const penaltyAmount = room.roomSize * 0.03;
  room.roomSize = Math.max(MIN_ROOM_SIZE, room.roomSize - penaltyAmount);

  // If room reaches minimum size, game over
  if (room.roomSize <= MIN_ROOM_SIZE) {
    room.gameOver = true;
    room.won = false;
  }

  return room;
}

// Set reduced motion preference
function setReducedMotion(room, reduced) {
  room.reducedMotion = reduced;
  return room;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createRoom,
    simulateRoom,
    trySolveStation,
    tryWrongAnswer,
    setReducedMotion,
    StationType,
    MIN_ROOM_SIZE,
    INITIAL_ROOM_SIZE
  };
}

// Default export for ES modules
export { createRoom, simulateRoom, trySolveStation, tryWrongAnswer, setReducedMotion, StationType, MIN_ROOM_SIZE, INITIAL_ROOM_SIZE };
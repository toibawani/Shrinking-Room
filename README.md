# Shrinking Room

A browser puzzle game about a room that is physically closing in on you.
Solve the puzzle inside before the walls do. Vanilla HTML, CSS, and
JavaScript — no build step, no dependencies, no server.

**[Play it](#running-locally)** by opening `index.html` in a browser.

## Concept

Every room shrinks on a fixed timer, visibly lurching inward in notches.
Somewhere inside is a puzzle — a memory sequence, a set of dials, a hidden
object, a pattern, a wiring puzzle, or a weight-balancing problem. Solve it
before the room closes, and the walls stop. Clear it fast enough and your
streak grows, unlocking new room "hazard classification" color themes.

## Features

- **6 puzzle types**, each with tunable difficulty parameters: symbol
  memory, rotating locks, hidden-key search, pattern completion, wire
  connect, and weight balance.
- **12 rooms**, escalating in difficulty; the last two chain two puzzle
  types back to back on a single timer.
- **A real shrinking-room mechanic** — smoothly animated wall notches,
  screen shake, particle bursts, and a hazard-stripe warning frame in the
  last seconds before each notch.
- **Streak system** with unlockable room themes (Thermal / Electrical /
  Radiological / Biological hazard classes).
- **Best-time tracking** and instant retry, all stored locally.
- **A local operator profile** (name only, no server, no password) with a
  first-time how-to-play walkthrough.
- **Synthesized sound effects** via the Web Audio API — no audio files to
  host.
- **Easy / Normal / Hard** difficulty, scaling both the timer and the
  wall-shrink speed.

## Running locally

No build step. Either:

- Double-click `index.html`, or
- Open the folder in VS Code and use the **Live Server** extension for
  auto-reload while editing.

## Project structure

```
shrinking-room/
├── index.html      All screens: landing, menu, level select, settings,
│                    game, tutorial, and overlays.
├── style.css        All styling, theming, and animation.
├── audio.js         Synthesized sound effects (Web Audio API).
├── levels.js        Level/room data — timing, room size, puzzle configs.
├── puzzles.js        The 6 puzzle modules plus the dispatcher.
└── game.js           Game loop, state, screen navigation, persistence.
```

## Adding a level

Levels are plain data in `levels.js`. Copy an existing entry, bump the
`id`, and adjust `timeLimit` / `shrinkNotches` / `initialRoomSize` /
`crushRoomSize`. A level can reference more than one puzzle in its
`puzzles` array to chain them on a single timer.

## Adding a puzzle type

Each puzzle module in `puzzles.js` exposes two functions:

- `generate(params)` — pure logic, returns a state object. No DOM access,
  so it's safe to unit test directly.
- `mount(state, container, onSolved)` — renders the puzzle into
  `container` and wires up input; calls `onSolved()` once solved.

Register the new module in `PUZZLE_MODULES` and add a one-line hint in
`PUZZLE_HINTS`.

## Notes on the "account" system

There is no backend. The landing screen's operator profile is a name
saved in `localStorage` on your own device, not a real multi-device
account. A true login system would need a server and a database, which
doesn't fit a project that runs by double-clicking a file.

## License

MIT — see [LICENSE](LICENSE).

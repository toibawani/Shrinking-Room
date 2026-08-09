# Shrinking Room

A browser puzzle game about a room that is physically closing in on you.
Solve the puzzle inside before the walls do. Full-stack: an Express +
SQLite backend with real accounts, and a vanilla HTML/CSS/JS frontend —
no framework, no build step on the client.

## Concept

Every room shrinks on a fixed timer, visibly lurching inward in notches,
with an adaptive background drone that climbs in pitch and pace as the
clock runs down. Somewhere inside is a puzzle — a memory sequence, a set
of dials, a hidden object, a pattern, a wiring puzzle, or a weight-
balancing problem. Solve it before the room closes, and the walls stop.
Clear it fast enough and your streak grows, unlocking new hazard-class
color themes. Twelve rooms, each with its own color, escalating
difficulty, and — in the last two — two puzzle types chained on a
single timer.

## Features

- **6 puzzle types**, each with tunable difficulty parameters: symbol
  memory, rotating locks, hidden-key search, pattern completion, wire
  connect, and weight balance.
- **12 rooms**, each with its own color, escalating in difficulty; the
  last two chain two puzzle types back to back on a single timer.
- **Real accounts** — sign up / sign in with a hashed password (bcrypt)
  and an httpOnly JWT session cookie. Progress is tied to your account
  and stored server-side in SQLite, not just your browser.
- **A real shrinking-room mechanic** — smoothly animated wall notches,
  screen shake, particle bursts, and a hazard-stripe warning frame in the
  last seconds before each notch.
- **Streak system** with unlockable room themes.
- **Adaptive background sound** — a synthesized drone (no audio files)
  that builds in pitch, volume, and pulse speed as a room's timer runs
  down, plus one-off effects for every interaction.
- **A first-time how-to-play walkthrough.**
- **Easy / Normal / Hard** difficulty, scaling both the timer and the
  wall-shrink speed.

## Running locally

Requires Node 22.5+ (uses the built-in `node:sqlite` module — no native
build step, no separate database install).

```bash
npm install
npm start
```

Then open `http://localhost:3000`. Data lives in `data/shrinkingroom.db`,
created automatically on first run (gitignored, so it starts fresh on
every clone).

For development with auto-restart on file changes:

```bash
npm run dev
```

### Environment variables

| Variable     | Default                          | Notes                                  |
|--------------|-----------------------------------|-----------------------------------------|
| `PORT`       | `3000`                            | Port the server listens on             |
| `JWT_SECRET` | an insecure dev default           | **Set a real random value before deploying anywhere public.** The server logs a warning if you don't. |

## Project structure

```
shrinking-room/
├── server.js         Express entry point.
├── src/
│   ├── db.js          SQLite connection + schema.
│   ├── auth.js         Signup / login / logout / me, bcrypt + JWT.
│   └── progress.js     Per-account save/load of game progress.
├── public/            Everything served to the browser.
│   ├── index.html       All screens: auth, menu, level select, settings,
│   │                     game, tutorial, and overlays.
│   ├── style.css         All styling, theming, and animation.
│   ├── audio.js          Synthesized SFX + adaptive background drone.
│   ├── levels.js         Level/room data — timing, size, puzzle configs.
│   ├── puzzles.js        The 6 puzzle modules plus the dispatcher.
│   └── game.js           Game loop, state, screen navigation, API calls.
└── data/               SQLite database file (gitignored).
```

## Adding a level

Levels are plain data in `public/levels.js`. Copy an existing entry,
bump the `id`, and adjust `timeLimit` / `shrinkNotches` /
`initialRoomSize` / `crushRoomSize`. A level can reference more than one
puzzle in its `puzzles` array to chain them on a single timer.

## Adding a puzzle type

Each puzzle module in `public/puzzles.js` exposes two functions:

- `generate(params)` — pure logic, returns a state object. No DOM access,
  so it's safe to unit test directly.
- `mount(state, container, onSolved)` — renders the puzzle into
  `container` and wires up input; calls `onSolved()` once solved.

Register the new module in `PUZZLE_MODULES` and add a one-line hint in
`PUZZLE_HINTS`.

## Security notes

- Passwords are hashed with bcrypt and never stored or logged in
  plaintext.
- Sessions are a JWT in an httpOnly cookie, so client-side JS never has
  direct access to the token.
- Login/signup error messages are deliberately generic (the same message
  for "wrong password" and "unknown username") to avoid leaking which
  usernames exist.
- Set a real `JWT_SECRET` before deploying anywhere public — the
  in-repo default is only safe for local development.

## License

MIT — see [LICENSE](LICENSE).

# Shrinking Room

A browser puzzle game about a room that is physically closing in on you.
Solve the puzzle inside before the walls do. Full-stack: Express + SQLite
backend with real accounts, and a vanilla HTML/CSS/JS frontend — no
framework, no client build step.

## Concept

Every room shrinks on a fixed timer, visibly lurching inward in notches,
with an adaptive background drone that climbs in pitch and pace as the
clock runs down. Somewhere inside is a puzzle — memory, locks, hidden
objects, patterns, wires, weights, or words. Solve it before the room
closes. Clear it fast enough and your streak grows, unlocking new room
themes. Twelve rooms across eight chapters, escalating in difficulty —
rooms 9–12 chain two puzzle types on a single timer.

## Features

- **7 puzzle types** with tunable difficulty: symbol memory, rotating
  locks, hidden-key search, pattern completion, wire connect, weight
  balance, and word forge.
- **12 rooms** in **8 chapters** (Awakening → Final Room), each with
  subtitle, progression metadata, and intentional difficulty curve.
- **Premium presentation** — atmospheric canvas rendering (floor grid,
  compression rings, corner stress marks), compression bar HUD, cinematic
  intro, endgame screen, and tactile micro-interactions throughout.
- **Real accounts** — bcrypt-hashed passwords, httpOnly JWT sessions,
  server-side SQLite progress.
- **Streak system** with unlockable room themes (cyan, violet, emerald).
- **Adaptive synthesized audio** — background tension drone plus SFX for
  every interaction; pause/resume without killing the audio layer.
- **Accessibility** — keyboard pause (Esc), Word Forge Enter/Backspace,
  focus states, reduced motion support, ARIA on dialogs.
- **Settings** — difficulty, sound, motion reduction, theme selection,
  progress reset.
- **Responsive** — stage scales to fit mobile viewports.

## Running locally

Requires Node 22.5+ (built-in `node:sqlite`).

```bash
npm install
npm start
```

Open `http://localhost:3000`. Database at `data/shrinkingroom.db` (auto-created, gitignored).

```bash
npm run dev   # auto-restart on file changes
```

### Environment variables

| Variable     | Default                | Notes                                          |
|--------------|------------------------|------------------------------------------------|
| `PORT`       | `3000`                 | Server port                                    |
| `JWT_SECRET` | insecure dev default   | **Set before any public deployment.**          |

## Project structure

```
shrinking-room/
├── server.js
├── src/
│   ├── db.js          SQLite schema + migrations
│   ├── auth.js        Signup / login / JWT sessions
│   └── progress.js    Per-account save/load
└── public/
    ├── index.html     All screens and overlays
    ├── style.css      Design system + puzzle styles
    ├── audio.js       Synthesized SFX + adaptive drone
    ├── levels.js      12 rooms + 8 chapters
    ├── puzzles.js     7 puzzle modules
    └── game.js        Game loop, canvas, navigation
```

## License

MIT — see [LICENSE](LICENSE).

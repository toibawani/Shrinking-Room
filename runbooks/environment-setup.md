# Environment setup

Fresh clone to running app. Copy-paste friendly.

## Prerequisites

- Node **22.5.0 or newer** (`node -v` to check)
- npm (ships with Node)

## Steps

```bash
git clone <repo-url> shrinking-room
cd shrinking-room
npm install
npm start
```

Open `http://localhost:3000`.

Optional dev mode (restart on file change):

```bash
npm run dev
```

## First run notes

- `data/` is **gitignored**. It is created automatically on first boot.
- `data/shrinkingroom.db` starts empty — no users, no progress.
- Create an account on the landing screen. Progress syncs to that account on this server instance.
- For local dev, `JWT_SECRET` can be unset; the server uses an insecure default and logs a warning. Set it if you care:

```bash
export JWT_SECRET=$(openssl rand -hex 32)
npm start
```

## Verify it worked

1. Landing screen loads with Sign In / Sign Up.
2. Sign up → main menu with "Begin" or "Continue".
3. Enter a room — canvas renders, timer counts down.
4. After clearing a room, reload the page — still signed in, progress retained.

If step 4 fails, check browser devtools → Network for `/api/progress` 401s (session/cookie issue) or 500s (DB problem — see `incident-response.md`).

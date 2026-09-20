# Deployment

## Build and start

There is no client build step. The game is static files in `public/` served by Express.

```bash
npm install
npm start
```

Default port is 3000. Override with `PORT`.

For local dev with auto-restart:

```bash
npm run dev
```

## Required environment

| Variable | Required | What happens if missing |
|----------|----------|-------------------------|
| `JWT_SECRET` | Yes, for any public host | Server boots with a hardcoded dev default. Console warns on startup. Sessions are forgeable — treat this as broken in production. |
| `PORT` | No | Defaults to 3000. |

### Rotating `JWT_SECRET`

All existing sessions invalidate immediately. Users must sign in again. No data loss in SQLite — only cookies stop working.

Set the new value, restart the process, confirm login works.

## Why Node 22.5+, not a static/edge host

This app is not a static site.

- Auth uses bcrypt + JWT in httpOnly cookies (`src/auth.js`).
- Progress lives in SQLite via `node:sqlite` (`src/db.js`) — built into Node 22.5+, not available on typical static/edge runtimes.
- API routes under `/api/auth` and `/api/progress` must run on the same origin as the game or cookies won't stick without extra CORS/cookie config nobody set up here.

Deploy to a Node 22.5+ process host (VPS, Railway, Fly, Render, etc.). Do not deploy `public/` alone to Netlify/Vercel static unless you also run the API somewhere else and rewire auth — out of scope for this repo.

## Rollback

1. Stop the running process.
2. Check out the previous known-good commit: `git checkout <sha>`
3. `npm install` (only if `package-lock.json` changed)
4. Restart with the same env vars and the same `data/` directory.

**Do not delete `data/` during rollback** unless you intend to wipe accounts. The SQLite file is the source of truth for progress.

If a bad deploy corrupted nothing but code, rollback is just git + restart. If you accidentally shipped without `JWT_SECRET` and users already got dev-default sessions, rotate the secret after rollback anyway.

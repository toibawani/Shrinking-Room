# Incident response

For a tired person at 2am. Check in order; stop when you find the break.

## Signup or login broken

1. **Is the server running?** Hit the root URL. You should get the game HTML, not a connection refused.
2. **Check server logs on boot.** Missing `JWT_SECRET` prints a warning — sessions work locally but are insecure; shouldn't block login unless something else is wrong.
3. **Try signup with a fresh username.** If signup 409s, username taken. If 400, validation failed (3–16 alphanumeric/underscore, password ≥ 6).
4. **Try login with known-good credentials.** 401 with "Invalid username or password." means bad creds OR user doesn't exist — by design, same message.
5. **Inspect `data/shrinkingroom.db` exists and is writable.** If `data/` can't be created or the DB file is read-only, signup fails when inserting the user row. Check disk space and permissions.
6. **Browser cookies.** Auth depends on httpOnly `sr_session` cookie. Blocked third-party cookies don't apply (same origin). Private mode with strict blocking, or hitting a different host than you signed up on, looks like logged-out.

API surface: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.

## SQLite file locked or corrupted

### How you'd tell

- Server logs mention `SQLITE_BUSY`, `database is locked`, or `database disk image is malformed`.
- Requests hang then 500. Signup/login/progress save all fail together.
- File size is 0 bytes or truncates suddenly after a crash.

### What to do

1. **Stop the server.** SQLite recovery needs exclusive access.
2. **Check for a stale process** still holding the file: another `node server.js`, a backup tool, or you SSH'd in twice.
3. **Backup before touching anything:** `cp data/shrinkingroom.db data/shrinkingroom.db.bak.$(date +%s)`
4. **Integrity check:** `sqlite3 data/shrinkingroom.db "PRAGMA integrity_check;"` — should return `ok`.
5. If corrupt and backup exists, restore the backup and restart.
6. If corrupt and no backup, rename the bad file aside (`mv data/shrinkingroom.db data/shrinkingroom.db.dead`), restart — app creates an empty DB. Users re-register; progress is gone unless you recover from backup.

Prevention: one Node process per DB file; graceful shutdown; don't copy the DB while the server is writing.

## Server won't boot

First three checks:

1. **Node version:** `node -v` must be ≥ 22.5.0. Older Node crashes on `require('node:sqlite')`.
2. **Port in use:** If something else owns `PORT` (default 3000), bind fails. Change `PORT` or kill the other process.
3. **`npm install` actually ran:** Missing `express`, `bcryptjs`, etc. throws `Cannot find module` immediately. Run `npm install` in the repo root.

# SportScore — Live Racquet Sports Scoring

A real-time, social scoring app for racquet sports. Create an account, start a
match on your phone, and anyone can watch the live score over WebSocket on the
public feed. Follow your friends to keep their matches on your dashboard.

## Features

- **Accounts** — sign up with **email + password** (OTP verified), or sign in with
  Google or a emailed login code. Every account gets a unique **username handle**
  (`@alex_07`) — friends find you and add you to matches by it; names aren't unique.
- **Verification** — emails are verified with 6-digit codes; every finished match counts toward stats
- **Live scoring** — point/undo/swap/reset, broadcast to all viewers in real time
- **Audit trail** — every event on a match records who did it (creator, players, invited scorers)
- **Finished results count** — the moment a match is over, the result is valid and counts toward player stats
- **Sports** — tennis, padel, pickleball, table tennis, squash, racquetball, badminton
- **Public feed** — every live and finished match, filterable by sport/status
- **Follow players** — dashboard shows live matches from the people you follow
- **Match history & stats** — wins/losses per player, per sport, head-to-head
- **Doubles** — each side can have 1 or 2 players

## Supported sports & scoring

| Sport         | Scoring                                             |
| ------------- | --------------------------------------------------- |
| Tennis        | Best of 3 sets, games to 6, deuce/advantage, tiebreak at 6-6 |
| Padel         | Same as tennis (best of 3 sets)                     |
| Pickleball    | Best of 3 games to 11, win by 2, side-out (server scores) |
| Table tennis  | Best of 5 games to 11, win by 2, serve every 2      |
| Squash        | Best of 5 games to 11, win by 2 (PAR)               |
| Racquetball   | Best of 3 games to 15, win by 2 (side-out, server scores) |
| Badminton     | Best of 3 games to 21, win by 2, serve every 2      |

## Quick start (local)

Requires **Node.js 18+** (built-in `node:sqlite` needs Node **22.5+**; Node 24 recommended).

```bash
npm install
npm run build     # web app -> dist/
npm start         # single server: API + WebSocket + static files on :4321
```

Open <http://localhost:4321> and register. On your phone/laptop on the same
network, open `http://<your-ip>:4321` to watch matches.

### Development mode

```bash
npm run dev
```

Runs Vite (:5173, with `/api` and `/ws` proxied to :4321) alongside the server.

## Email verification & login codes (Resend)

A verification code is emailed when you register, and again when you sign in
with an email code. Emails are sent through [Resend](https://resend.com).

- Set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender, e.g. `SportScore <onboarding@resend.dev>`).
- **Without a key** (local dev) the server runs in *dev mode*: it prints the code
  on screen so you can move straight through registration and login.

## Usernames

Every account has a unique **username** (lowercase, `a–z`, `0–9`, `_`, 3–20
chars). It's the handle friends use to find you in the opponent picker and to
add you to a match — you can also type an `@handle` directly when creating a
match. Leave the field blank at sign-up and one is auto-generated from your
name.

## Dev-mode codes (`DEV_CODES`)

With `DEV_CODES=1` (and not `NODE_ENV=production`) the app shows every
verification code **on screen** and never calls Resend — handy while developing
even if you already set a real key. Remove it (or set `NODE_ENV=production`) to
force real emails.

## Seeding demo data

So a fresh deployment doesn't look empty, sample players and demo matches can be
seeded on demand (kept OFF by default):

```bash
node server/seed.mjs         # sample player accounts only (28 top players, per sport)
node server/seed.mjs --demo   # + 8 finished + 1 live demo match, valid engine states
```

Setting `SEED_DEMO=1` in the environment does the same. The demo matches play out
through the real scoring engine, so every seeded match page, the live feed and the
leaderboard render completely. Ideal for testing the landing page on a clean DB.

## Google sign-in

1. Create a Google Cloud project → OAuth consent screen (External) →
   **Authorized redirect URI** = `https://<your-domain>/api/auth/google/callback`.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Set `BASE_URL` to the absolute URL of your deployment so the redirect
   matches an allowed redirect URI.

Login redirects back to `BASE_URL`'s home page.

## Trust & credibility

- Only a match's **creator, listed players, or invited scorers** can change the score.
- The creator is automatically the first scorer and can add more scorers later.
- Every change is written to the match **timeline with the actor's name**.
- The match is over once the scoreboard reaches the finishing condition; that
  **final result is immediately valid** and counts toward player stats.

## Deploying to the cloud (free)

The app is one self-contained Node process, so any Node host works. Examples:

### Render

1. Push to a GitHub repo.
2. New **Web Service** → pick the repo.
3. Build command: `npm install && npm run build`
4. Start command: `node server/server.mjs`
5. Set `PORT=10000` (Render sets it automatically), `DATABASE_PATH=/var/data/sportscore.db`
   if you attach a disk, plus `BASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and your
   Google OAuth values.

### Railway / Fly.io

- Railway: Start command `node server/server.mjs`, add the `PORT` env var.
- Fly.io: add `PORT` to `fly.toml`; start command `node server/server.mjs`.

> **Persistence warning:** the database is a SQLite file. On free plans the
> filesystem is ephemeral and is reset on every redeploy. To keep your accounts
> and match history across deploys, mount a persistent disk at your
> `DATABASE_PATH`, or point `DATABASE_PATH` at a managed SQLite-compatible DB.
> `DATABASE_PATH` can point the server at a different location, e.g.
> `DATABASE_PATH=/path/to/sportscore.db npm start`.

## Environment variables

| Variable                | Default                     | Purpose                                   |
| ----------------------- | --------------------------- | ----------------------------------------- |
| `PORT`                  | `4321`                      | HTTP + WebSocket port                     |
| `DATABASE_PATH`         | `./data/sportscore.db`      | Where the SQLite file lives               |
| `SESSION_SECRET`        | random at boot              | Cookie signing secret (set in production) |
| `BASE_URL`              | `http://localhost:4321`     | Public site URL (Google redirect)         |
| `RESEND_API_KEY`        | (none)                      | Sends OTP emails; unset = dev mode        |
| `EMAIL_FROM`            | `SportScore <onboarding@resend.dev>` | Verified Resend sender         |
| `DEV_CODES`             | (off)                       | `1` shows codes on screen instead of sending |
| `GOOGLE_CLIENT_ID`      | (none)                      | Enables Google sign-in                    |
| `GOOGLE_CLIENT_SECRET`  | (none)                      | Enables Google sign-in                    |

The server also loads a `.env` file from the project root if one exists
(real environment variables always win).

## Scripts

| Script          | What it does                              |
| --------------- | ----------------------------------------- |
| `npm run dev`   | Vite dev server + backend together (HMR)  |
| `npm run build` | Production build to `dist/`               |
| `npm start`     | Serve `dist/` + API + WebSocket (:4321)   |

## Project layout

```
server/server.mjs      Express + WebSocket server (auth, broadcast, static)
server/db.mjs          node:sqlite schema + queries (users, OTP, OAuth, scorers)
server/auth.mjs        register/login/session helpers
server/api.mjs         REST API + shared match-action path (HTTP + WS)
server/otp.mjs         Email code issue/verify (rate-limited, single-use)
server/email.mjs       Resend email sender (dev fallback shows the code)
server/google.mjs      Google OAuth2 flow (redirect, token exchange)
server/env.mjs         Tiny .env loader (no dependencies)
src/lib/sports.js      sport definitions & rules
src/lib/engine.js      pure scoring engine (state machine, undo history)
src/hooks/useScoreboard.js  WS scoreboard hook (live updates)
src/pages/             Landing, Login, LoginOtp, Register, VerifyEmail,
                       Dashboard, NewMatch, MatchPage, Feed, PlayerPage
test-e2e.mjs           End-to-end API test (register/verify -> OTP/username ->
                       scorer role -> finished match counts -> stats)
```

## Architecture notes

- The **engine** is a pure state machine (`src/lib/engine.js`): `apply(state,
  action)` returns the next state. Undo history is kept **flat** in memory per
  match (available while the server process is alive); only history-less
  snapshots are persisted and broadcast, so match state stays small even after
  hundreds of points.
- **Auth**: `bcryptjs` password hashes + httpOnly session cookie (`ss_sess`);
  email codes are sha-256 hashed, expire in 10 minutes, and are single-use.
- **Permissions**: scoring requires creator/player/scorer (server-side for HTTP and WebSocket).
- **Broadcast**: WebSocket clients subscribe to a match (`/ws?match=<id>`) or to
  the live feed (`/ws`). Every score change pushes the new state to that match's
  viewers and signals the feed to refresh.
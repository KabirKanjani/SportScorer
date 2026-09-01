# SportScore — Production launch runbook

This app is already production-ready in code (see the "What's already done" section).
Launching is a **configuration** job: upgrade Render, point it at a persistent disk,
wire a verified email sender, and double-check a few settings. Follow this top to bottom.

> Current (Sept 2026): deployed at **https://sportscore.onrender.com** on the free
> plan. Free = **ephemeral filesystem, data wiped on every deploy.** Until you
> upgrade, treat it as a public demo, not a home for real accounts.

---

## Stage 1 — Persistent data (required before real users)

Render **free** plans wipe the filesystem (SQLite DB + avatars) on every deploy.
The repo already mounts a `/data` disk in `render.yaml`, but Render only activates
disks on **paid plans**.

1. In the Render dashboard open the **sportscore** web service → **Settings** →
   **Plan**, and upgrade to at least **Starter** (~$7/mo). This enables:
   - the persistent disk (`render.yaml` already maps `DATA_DIR=/data` to it) so
     accounts/matches/tournaments/avatars survive redeploys, and
   - custom domains (future), and
   - Sensitive env vars + `RENDER_GIT_COMMIT`-based deploys.
2. In **Settings → Disks**, confirm the disk named `data` is attached at `/data`.
3. On the **Env vars** tab, make sure these are set:
   - `BASE_URL` = `https://sportscore.onrender.com` (used for email/redirect links)
   - `NODE_ENV` = `production` (Render defaults to this for web services)
   - `DATA_DIR` = `/data`
   - `DEV_CODES` = `0`
4. **Before** it matters, verify persistence survives a redeploy: create a throwaway
   account → trigger a manual deploy → confirm the account still exists.

---

## Stage 2 — Real sign-up emails (required)

Register/login emails are sent through **Resend**. Free plan = you see codes on
screen, which is wrong for real users.

1. Sign up at https://resend.com (free tier ~3,000 emails/mo is plenty to start).
2. Add a **sending domain** and verify it (add the `MX`/`SPF`/`DKIM` DNS records).
   → The shared `onboarding@resend.dev` sender works out of the box but shows
   "sent via Resend" and can't be your own brand.
3. Create an **API key**.
4. In Render **Env vars**, add:
   - `RESEND_API_KEY` = the key
   - `EMAIL_FROM` = a verified sender, e.g. `SportScore <score@yourdomain.com>`
5. Re-test registration: you should receive a real verification email.

> If you don't have a domain yet, Resend's `onboarding@resend.dev` gets you going
> now; swap to your own domain when you buy one.

---

## Stage 3 — Custom domain (when ready)

You chose the Render subdomain for now. When you want a real URL:

1. In Render: web service → **Settings** → **Custom Domains** → add `sportscore.app`
   (or whatever you own).
2. Add the DNS records Render shows (usually `CNAME` to `onrender.com`).
3. Set `BASE_URL=https://sportscore.app` in Env vars and redeploy.
4. If Google sign-in is on, add `https://sportscore.app/api/auth/google/callback`
   to the Google OAuth authorized redirect URIs.

---

## Stage 4 — Error monitoring (recommended)

The code already sends crashes to Sentry; it's a no-op until you set the DSNs.

1. Create a free project at https://sentry.io.
2. Copy the **DSN** (server) and the **client/public key**.
3. Add to Render Env vars:
   - `SENTRY_DSN` = the DSN
   - `SENTRY_CLIENT_KEY` = the public client key (embedded into the HTML for
     browser errors)
4. Redeploy, then deliberately break something in a browser/API call and confirm
   the issue appears in your Sentry dashboard.

---

## Verification checklist (run after config)

- [ ] `GET https://sportscore.onrender.com/api/health` → `{"ok":true}`
- [ ] Register a fresh account → real verification email arrives → you can log in
- [ ] Create a match, add an opponent, start it — live feed + WebSocket works
- [ ] Finish a match → result appears on the feed and player stats
- [ ] Kill/restart the service (or trigger a manual deploy) → accounts & history persist
- [ ] `/privacy` and `/terms` pages load (incorporated in the site footer)
- [ ] (If configured) Google sign-in completes the redirect loop

---

## What's already wired (you don't need to build these)

- **Persistent disk config** — `render.yaml` mounts `/data`; server uses `DATA_DIR`.
- **Health check** — `GET /api/health`.
- **Error tracking** — `@sentry/node` + browser loader, DSN-gated no-op until set.
- **Emails** — Resend integration in `server/email.mjs`, 8s timeout, dev fallback.
- **Google sign-in** — full OAuth flow, disabled until credentials are set.
- **Legal** — `Privacy` and `Terms` pages at `/privacy` and `/terms`.
- **Backups** — `backup.mjs` script exists (see below).

## Backups

`backup.mjs` snapshots the SQLite DB. With `/data` persisted on Render, run it
against `DATA_DIR` (or download `/data/sportscore.db` via the Render shell) on a
schedule. For a robust setup, push the DB to a private object store daily — easy to
add later.

## Environment variables (complete reference)

See `.env.example` for every variable and its purpose. All optional ones are safe
no-ops when unset.

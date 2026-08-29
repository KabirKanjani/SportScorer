// SportScore server
//
// - HTTP API (Express): auth, matches, users, follow, stats
// - WebSocket: per-match real-time sync + feed update events
// - Serves the built frontend (dist/) in production
//
// Dev:    npm run dev     (vite :5173 proxies /api and /ws to here :4321)
// Prod:   npm run build && npm start  (single process on :4321)

import './env.mjs'; // load .env before anything reads process.env

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';

import { createApi, processMatchAction, matchSummary } from './api.mjs';
import { getMatch, getEvents, getUserBySession, getUserById, getTournamentById, canScore } from './db.mjs';
import { seedSampleUsers } from './seed.mjs';
import { stripHistory } from '../src/lib/engine.js';
import { SPORTS } from '../src/lib/sports.js';
import { sessionTokenFromRequest } from './auth.mjs';
import { rateLimiter } from './rate-limit.mjs';
import { backupDatabase } from '../backup.mjs';
import { initSentry, Sentry } from './sentry.mjs';

initSentry();

// Never die silently: surface the crash to Sentry, then resume default behaviour.
process.on('uncaughtException', (err) => {
  Sentry.captureException(err, { tags: { source: 'uncaughtException' } });
  console.error('[fatal]', err);
});
process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
    tags: { source: 'unhandledRejection' },
  });
  console.error('[fatal] unhandled rejection', reason);
});

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = normalize(join(__dirname, '..', 'dist'));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const UPLOADS_DIR = normalize(join(DATA_DIR, 'avatars'));
mkdirSync(UPLOADS_DIR, { recursive: true });
const PORT = process.env.PORT || 4321;

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy: honor X-Forwarded-For
app.use(express.json({ limit: '1mb' }));

// Basic hardening headers (Helmet subset that is safe for a same-origin SPA).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Rate limiting: auth/verification endpoints are the interesting brute-force
// targets; public listings get a looser cap to blunt scraping.
const authAuth = rateLimiter({ name: 'auth', max: 15 });
const codeAuth = rateLimiter({ name: 'code', max: 30 });
const readAuth = rateLimiter({ name: 'read', max: 90 });
for (const p of ['/api/register', '/api/login', '/api/auth/reset-password']) {
  app.use(p, authAuth);
}
for (const p of ['/api/otp/send', '/api/otp/verify', '/api/auth/google', '/api/auth/google/callback']) {
  app.use(p, codeAuth);
}
for (const p of ['/api/matches', '/api/users', '/api/tournaments']) {
  app.use(p, readAuth);
}

// CORS for the bundled mobile app. When web assets ship inside the APK/IPA the
// app's origin is https://localhost (Android) or capacitor://localhost (iOS),
// while the API lives on the hosted origin — so we must allow that pair with
// credentials (session cookies). The web app itself stays same-origin.
const APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost', 'http://localhost']);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && APP_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// WebSocket clients grouped for broadcasting
const wsClients = new Set(); // { ws, match, live }

function wsSendTo(client, msg) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(msg));
  }
}

function broadcast(item) {
  // item: 'feed' | 'match:<id>'
  for (const c of wsClients) {
    if (item === 'feed' && c.live) {
      wsSendTo(c, { type: 'feed-changed' });
    } else if (item.startsWith('match:') && c.match === item.slice(6)) {
      const m = getMatch(c.match);
      if (m) {
        wsSendTo(c, { type: 'state', state: stripHistory(m.state) });
        wsSendTo(c, { type: 'meta', summary: summarizeMeta(m) });
        wsSendTo(c, { type: 'events', events: getEvents(c.match) });
      }
    }
  }
}

// small helper to build the match meta for WS clients
function summarizeMeta(m) {
  return matchSummary(m);
}

app.use('/api', createApi({ broadcast }));

// Uploaded avatars (PNG/JPG/GIF/WebP written by the API).
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', immutable: true }));

// Server-rendered link-preview meta for shareable routes. Social scrapers
// (WhatsApp, iMessage, X, Discord, FB) fetch the raw HTML and read the og: tags
// — they never run the SPA — so the fixed tags in index.html get swapped for
// route-accurate ones here.
const SITE = process.env.BASE_URL || 'https://sportscore.onrender.com';

function previewMeta(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const [route, id] = parts;
  const url = `${SITE}/${parts.join('/')}`;
  const statusWord = { draft: 'Draft', live: 'Live now', finished: 'Final' };

  if (route === 'match' && id) {
    const m = getMatch(id);
    if (m) {
      const s = matchSummary(m);
      const vs = `${s.sides[0]} vs ${s.sides[1]}`;
      const sc = Array.isArray(s.score.setCounts)
        ? `${s.score.setCounts[0] ?? 0}–${s.score.setCounts[1] ?? 0}`
        : '';
      return {
        title: `${vs} · ${statusWord[m.status] || 'Match'} on SportScore`,
        description:
          m.status === 'finished' && sc
            ? `${s.sportName} · Final score ${sc}`
            : `${s.sportName} · ${vs} · ${statusWord[m.status] || 'Match'}`,
        url,
      };
    }
  }

  if (route === 'player' && id) {
    const u = getUserById(Number(id));
    if (u) {
      return {
        title: `${u.name} · SportScore profile`,
        description: u.username
          ? `${u.name} (@${u.username}) — follow their matches on SportScore.`
          : `${u.name} — follow their matches on SportScore.`,
        url,
      };
    }
  }

  if (route === 'tournaments' && id) {
    const t = getTournamentById(Number(id));
    if (t) {
      const sport = SPORTS[t.sport];
      return {
        title: `${t.name} · ${statusWord[t.status] || 'Tournament'} on SportScore`,
        description: `${sport?.name || 'Tournament'} knockout — ${t.visibility === 'private' ? 'private' : 'public'} · SportScore.`,
        url,
      };
    }
  }

  return null;
}

function injectPreviewMeta(html, pathname) {
  const meta = previewMeta(pathname);
  if (!meta) return html;
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const { title, description, url } = meta;
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/name="description" content="[^"]*"/, `name="description" content="${esc(description)}"`)
    .replace(/property="og:title" content="[^"]*"/, `property="og:title" content="${esc(title)}"`)
    .replace(/property="og:description" content="[^"]*"/, `property="og:description" content="${esc(description)}"`)
    .replace(/name="twitter:title" content="[^"]*"/, `name="twitter:title" content="${esc(title)}"`)
    .replace(/name="twitter:description" content="[^"]*"/, `name="twitter:description" content="${esc(description)}"`)
    .replace(/property="og:url" content="[^"]*"/, `property="og:url" content="${esc(url)}"`);
}

// Static files (production build)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

app.use(async (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    let pathname = decodeURIComponent(req.path) || '/';
    if (pathname === '/') pathname = '/index.html';
    const filePath = normalize(join(DIST_DIR, pathname));
    if (!filePath.startsWith(DIST_DIR)) {
      return res.status(403).send('Forbidden');
    }
    const ext = extname(filePath) || '.html';
    let body;
    try {
      body = await readFile(filePath);
    } catch {
      // SPA fallback is only for extensionless navigation routes, never assets.
      if (ext !== '.html') {
        return res.status(404).send('Not found');
      }
      body = await readFile(join(DIST_DIR, 'index.html'));
    }
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    if (ext === '.html') {
      // Never cache HTML: hashed asset names can change on every deploy, and a
      // stale HTML referencing a removed bundle would blank the whole page.
      res.setHeader('Cache-Control', 'no-cache');
      res.send(injectPreviewMeta(body.toString('utf8'), pathname));
      return;
    }
    if (pathname.startsWith('/assets/')) {
      // Hashed, immutable build artifacts.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    res.send(body);
  } catch (e) {
    Sentry.captureException(e, { tags: { source: 'static' } });
    res.status(500).send('Server error');
  }
});

// Express error-handler glue: forward any thrown route errors to Sentry.
Sentry.setupExpressErrorHandler(app);

// ---------------------------------------------------------------------------
// HTTP server + WebSocket upgrade
// ---------------------------------------------------------------------------
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const match = url.searchParams.get('match');
  const live = !match; // no match param => feed/live client

  const client = { ws, match, live };
  wsClients.add(client);

  // Auth (optional): resolve the user from the session cookie if present
  const token = sessionTokenFromRequest(req);
  const user = token ? getUserBySession(token) : null;

  if (match) {
    const m = getMatch(match);
    if (!m) {
      wsSendTo(client, { type: 'error', error: 'Match not found' });
      ws.close();
      return;
    }
    wsSendTo(client, {
      type: 'init',
      state: stripHistory(m.state),
      match: matchSummary(m),
      canScore: user ? canScore(match, user.id) : false,
      events: getEvents(match),
    });
  } else {
    wsSendTo(client, { type: 'init-live' });
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case 'cmd': {
        if (!client.match) return;
        // Must be authorized + have scoring rights (server-side check)
        const token = sessionTokenFromRequest(req);
        const u = token ? getUserBySession(token) : null;
        if (!u) {
          wsSendTo(client, { type: 'error', error: 'Not logged in' });
          return;
        }
        if (!canScore(client.match, u.id)) {
          wsSendTo(client, { type: 'error', error: 'Not a player of this match' });
          return;
        }
        // Run the action via the same path the HTTP API uses, then broadcast.
        processMatchAction(client.match, msg.action, u, broadcast).then((ok) => {
          if (ok?.error) wsSendTo(client, { type: 'error', error: ok.error });
        });
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    wsClients.delete(client);
  });

  ws.on('error', (err) => {
    Sentry.captureException(err, { tags: { source: 'ws' } });
    wsClients.delete(client);
  });
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(PORT, () => {
  try {
    // Snapshot the previous database before this process starts writing.
    const { target } = backupDatabase();
    console.log(`  Backed up database (${target})`);
  } catch (e) {
    console.warn(`  Backup skipped: ${e.message}`);
  }
  const seeded = seedSampleUsers();
  console.log(`\n  SportScore running`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Opened on any device via http://<your-ip>:${PORT}`);
  console.log(`  ws://localhost:${PORT}/ws (match=ID or live feed)\n`);
  if (seeded.seeded > 0) console.log(`  Seeded ${seeded.seeded} sample players into an empty DB`);
});
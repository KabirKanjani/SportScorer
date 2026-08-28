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
import { getMatch, getEvents, getUserBySession, canScore } from './db.mjs';
import { stripHistory } from '../src/lib/engine.js';
import { sessionTokenFromRequest } from './auth.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = normalize(join(__dirname, '..', 'dist'));
const UPLOADS_DIR = normalize(join(__dirname, '..', 'data', 'avatars'));
mkdirSync(UPLOADS_DIR, { recursive: true });
const PORT = process.env.PORT || 4321;

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '1mb' }));

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
    let body;
    try {
      body = await readFile(filePath);
    } catch {
      body = await readFile(join(DIST_DIR, 'index.html'));
    }
    const ext = extname(filePath) || '.html';
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.send(body);
  } catch (e) {
    res.status(500).send('Server error');
  }
});

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

  ws.on('error', () => {
    wsClients.delete(client);
  });
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(PORT, () => {
  console.log(`\n  SportScore running`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Opened on any device via http://<your-ip>:${PORT}`);
  console.log(`  ws://localhost:${PORT}/ws (match=ID or live feed)\n`);
});
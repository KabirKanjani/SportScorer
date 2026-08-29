// HTTP API routers for SportScore.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  createMatch,
  getMatch,
  listMatches,
  listMatchesByUser,
  listMatchesByFollowed,
  addMatchPlayer,
  saveMatchState,
  canScore,
  getEvents,
  addEvent,
  isFollowing,
  followUser,
  unfollowUser,
  countFollowers,
  followingIds,
  searchUsers,
  resolveUserEntry,
  getUserById,
  getUserByUsername,
  serializeUser,
  setUserAvatar,
  clearUserAvatar,
  isPlayerOf,
  isCreatorOf,
  isScorerOf,
  addScorer,
  matchStarted,
  setMatchStarted,
  createTournament,
  getTournamentById,
  listTournamentsForUser,
  getTournamentPlayers,
  addTournamentPlayer,
  isTournamentPlayer,
  isTournamentCreator,
  setTournamentStatus,
  setTournamentWinner,
  createFixture,
  getFixtures,
  getFixtureById,
  getFixtureByMatch,
  setFixtureMatch,
  resolveFixtureWinner,
} from './db.mjs';
import { initialState, apply, getDisplay, stripHistory } from '../src/lib/engine.js';
import { SPORTS } from '../src/lib/sports.js';
import { buildBracket, fixtureView, onFixtureMatchFinished } from './tournament.mjs';
import {
  attachUser,
  registerRoute,
  loginRoute,
  logoutRoute,
  meRoute,
  startSession,
} from './auth.mjs';
import {
  issueOtp,
  verifyOtp,
  isOtpPurpose,
} from './otp.mjs';
import { findOrCreateOAuthUser } from './db.mjs';
import {
  googleConfigured,
  newOAuthState,
  consumeOAuthState,
  googleAuthUrl,
  exchangeGoogleCode,
  BASE_URL,
} from './google.mjs';

// ---- Avatar uploads ---------------------------------------------------------
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AVATAR_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'avatars'
);
mkdirSync(AVATAR_DIR, { recursive: true });
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

// Sniff the leading bytes so we only ever store real image files.
function sniffImage(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'webp';
  return null;
}

function storeAvatar(user, buf, ext) {
  const file = `u${user.id}_${Date.now().toString(36)}.${ext}`;
  writeFileSync(join(AVATAR_DIR, file), buf);
  if (user.avatar && existsSync(join(AVATAR_DIR, user.avatar))) {
    try {
      unlinkSync(join(AVATAR_DIR, user.avatar));
    } catch {}
  }
  setUserAvatar(user.id, file);
}

// ---- Match summaries (used by the feed + match cards) -----------------------

export function playerSideLabel(names) {
  if (names.length === 1) return names[0];
  return names.join(' & ');
}

export function matchSummary(m) {
  const display = getDisplay(m.state);
  const sport = SPORTS[m.sport];
  const sides = [[], []];
  for (const p of m.players) {
    if (p.side === 0 || p.side === 1) sides[p.side].push(p.name);
  }
  // Fall back to engine names when no registered players linked
  if (sides[0].length === 0) sides[0].push(display.playerNames[0]);
  if (sides[1].length === 0) sides[1].push(display.playerNames[1]);

  let durationMinutes = null;
  if (m.finishedAt && m.createdAt) {
    const ms = new Date(m.finishedAt) - new Date(m.createdAt);
    if (Number.isFinite(ms) && ms > 0) durationMinutes = Math.round(ms / 60000);
  }
  const finished = m.status === 'finished';

  return {
    id: m.id,
    sport: m.sport,
    sportName: sport.name,
    icon: sport.icon,
    status: m.status,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    finishedAt: m.finishedAt,
    durationMinutes,
    sides: [playerSideLabel(sides[0]), playerSideLabel(sides[1])],
    sidePlayers: sides,
    score: {
      setCounts: display.setCounts,
      gamesInSet: display.gamesInSet,
      points: display.points,
      tiebreak: display.tiebreak,
    },
    winner: finished ? display.winnerIdx : null,
    winnerNames:
      finished && display.winnerIdx !== null ? sides[display.winnerIdx] : null,
    tournament: summarizeTournamentRef(m.id),
    preMatch: m.preMatch,
    started: matchStarted(m.id),
    createdBy: m.createdBy,
  };
}

// If this match is a tournament fixture, point back at the tournament.
function summarizeTournamentRef(matchId) {
  const fx = getFixtureByMatch(matchId);
  if (!fx) return null;
  const t = getTournamentById(fx.tournament_id);
  if (!t) return null;
  return { id: t.id, name: t.name, round: fx.round };
}

export function summarizeList(matches) {
  return matches.map(matchSummary);
}

// ---- Match action queue (per-match serialization) ---------------------------

const queues = new Map();
function enqueue(matchId, fn) {
  const prev = queues.get(matchId) || Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(
    matchId,
    next.catch(() => {})
  );
  return next;
}

function milestoneEvents(before, after, name0, name1) {
  const out = [];
  const names = [name0, name1];
  if (!before.matchOver && after.matchOver && after.winnerIdx !== null) {
    out.push(`${names[after.winnerIdx]} wins the match! 🏆`);
    return out;
  }
  const bd = getDisplay(before);
  const ad = getDisplay(after);
  if (!bd.tiebreak && ad.tiebreak) out.push('Tiebreak!');
  if (ad.matchOver) return out;
  // set/game changes
  if (ad.setCounts[0] !== bd.setCounts[0] || ad.setCounts[1] !== bd.setCounts[1]) {
    // who moved ahead? determine from current points
    out.push('Set complete');
  } else if (
    (ad.gamesInSet && ad.gamesInSet[0] !== bd.gamesInSet[0]) ||
    (ad.gamesInSet && ad.gamesInSet[1] !== bd.gamesInSet[1])
  ) {
    out.push('Game complete');
  }
  return out;
}

// Full live states (with undo history) are kept in memory only; the DB and
// network carry history-less snapshots so JSON size stays linear.
const liveStates = new Map();

function fullStateOf(matchId) {
  if (liveStates.has(matchId)) return liveStates.get(matchId);
  const m = getMatch(matchId);
  return m ? m.state : null;
}

// Apply a single command to a stored match (shared by HTTP + WebSocket).
// broadcast('match:id'| 'feed') is invoked after the state changes.
export async function processMatchAction(matchId, action, user, broadcast = () => {}) {
  if (!user || !canScore(matchId, user.id)) {
    return { error: 'You are not a player or scorer of this match', code: 403 };
  }
  const m = getMatch(matchId);
  if (!m) return { error: 'Match not found', code: 404 };

  // Credibility gate: scoring stays locked until the creator starts the match.
  if (!matchStarted(matchId) && action.type !== 'swap') {
    return {
      error: 'This match has not started yet — only the creator can start it.',
      code: 409,
    };
  }

  return enqueue(matchId, () => {
    const before = fullStateOf(matchId);
    const next = runAction(before, action);
    if (next.error) return next;
    liveStates.set(matchId, next);
    saveMatchState(matchId, stripHistory(next), { finish: next.matchOver });

    // If this match belongs to a tournament fixture, record who won and crown
    // a champion once the final is done.
    if (next.matchOver && next.winnerIdx != null) {
      const m = getMatch(matchId);
      const win = m?.players.find((p) => p.side === next.winnerIdx);
      if (win) onFixtureMatchFinished(matchId, win.userId);
    }

    const names = [next.playerNames[0], next.playerNames[1]];
    if (action.type === 'point') {
      const who = next.playerNames[action.player];
      addEvent(matchId, `Point to ${who} 🎯`, user.id);
      for (const ev of milestoneEvents(before, next, names[0], names[1])) {
        addEvent(matchId, ev, user.id);
      }
    } else if (action.type === 'undo') {
      addEvent(matchId, '↩ Undo', user.id);
    } else if (action.type === 'reset') {
      addEvent(matchId, '⟲ New match', user.id);
    } else if (action.type === 'swap') {
      addEvent(matchId, '⇄ Sides swapped', user.id);
    } else if (action.type === 'detail') {
      const detail = String(action.detail || '').trim();
      if (detail) addEvent(matchId, `↳ ${detail}`, user.id);
    }
    broadcast(`match:${matchId}`);
    broadcast('feed');
    return { state: next, status: next.matchOver ? 'finished' : 'live' };
  });
}

function runAction(state, action) {
  try {
    return apply(state, action);
  } catch (e) {
    return { error: 'Invalid action' };
  }
}

// ---- Router -----------------------------------------------------------------

export function createApi({ broadcast }) {
  const api = Router();

  api.use(attachUser);

  // Auth
  api.post('/register', registerRoute);
  api.post('/login', loginRoute);
  api.post('/logout', logoutRoute);
  api.get('/me', meRoute);
  api.get('/me/following', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    res.json({ ids: followingIds(req.user.id) });
  });

  // Upload / remove a profile picture (PNG/JPG/GIF/WebP, up to 3MB).
  api.post('/me/avatar', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const { data } = req.body || {};
    if (typeof data !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(data)) {
      return res.status(400).json({ error: 'Send an image as a base64 data URL' });
    }
    const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    if (buf.length === 0 || buf.length > MAX_AVATAR_BYTES) {
      return res.status(400).json({ error: `Image must be between 1 byte and ${MAX_AVATAR_BYTES / 1024 / 1024}MB` });
    }
    const ext = sniffImage(buf);
    if (!ext) {
      return res.status(400).json({ error: 'That file is not a PNG, JPG, GIF or WebP image' });
    }
    const u = getUserById(req.user.id);
    if (!u) return res.status(401).json({ error: 'Not logged in' });
    storeAvatar(u, buf, ext);
    res.json({ user: serializeUser(getUserById(req.user.id)) });
  });

  api.delete('/me/avatar', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const u = getUserById(req.user.id);
    if (!u) return res.status(401).json({ error: 'Not logged in' });
    if (u.avatar && existsSync(join(AVATAR_DIR, u.avatar))) {
      try {
        unlinkSync(join(AVATAR_DIR, u.avatar));
      } catch {}
    }
    clearUserAvatar(u.id);
    res.json({ user: serializeUser(getUserById(req.user.id)) });
  });

  // Email OTP: send a code, then verify it (verify account or passwordless login)
  api.post('/otp/send', async (req, res) => {
    const { email, purpose } = req.body || {};
    if (!email || !isOtpPurpose(purpose)) {
      return res.status(400).json({ error: 'Email and purpose are required' });
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
    if (!emailOk) return res.status(400).json({ error: 'Please enter a valid email' });
    try {
      const out = await issueOtp(String(email).trim(), purpose);
      if (out.error) return res.status(out.code || 400).json({ error: out.error });
      return res.json({ ok: true, ...(out.devCode ? { devCode: out.devCode } : {}) });
    } catch (e) {
      return res.status(502).json({ error: 'Could not send the email right now.' });
    }
  });

  api.post('/otp/verify', (req, res) => {
    const { email, purpose, code } = req.body || {};
    const out = verifyOtp(email, purpose, code);
    if (out.error) return res.status(out.code || 400).json({ error: out.error });
    return res.json({ ok: true, user: startSession(req, res, out.user) });
  });

  // Google Sign in
  api.get('/auth/google/config', (_req, res) => {
    res.json({ available: googleConfigured() });
  });

  // Guard against open redirects: only ever send the browser back to the web
  // app's own origin, or to a bundled app origin (localhost / capacitor://).
  function safeRedirect(value) {
    if (!value) return '';
    try {
      const u = new URL(String(value));
      if (u.hostname === 'localhost') return String(value);
      if (u.host === new URL(BASE_URL).host) return String(value);
    } catch {
      /* malformed URL */
    }
    return '';
  }

  api.get('/auth/google', (req, res) => {
    if (!googleConfigured()) {
      return res
        .status(503)
        .json({ error: 'Google sign-in is not configured on this server yet.' });
    }
    const redirect = safeRedirect(String(req.query.redirect || ''));
    const state = newOAuthState(redirect);
    res.redirect(googleAuthUrl(state));
  });

  api.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query || {};
    const redirect = consumeOAuthState(String(state));
    if (!code || redirect === null) {
      return res.status(400).send('Invalid or expired sign-in request. Please try again.');
    }
    try {
      const { email, name, sub } = await exchangeGoogleCode(String(code));
      const { user } = findOrCreateOAuthUser({ provider: 'google', sub, email, name });
      startSession(req, res, user);
      return res.redirect(redirect || `${BASE_URL}/`);
    } catch (e) {
      return res
        .status(400)
        .redirect(`${BASE_URL}/login?error=${encodeURIComponent(e.message)}`);
    }
  });

  // Users / players
  api.get('/users', (req, res) => {
    const q = String(req.query.q || '').trim();
    res.json({ users: searchUsers(q, 50) });
  });

  api.get('/me/live', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const list = listMatchesByUser(req.user.id, { limit: 20 }).filter(
      (m) => m.status === 'live'
    );
    res.json({ matches: summarizeList(list) });
  });

  api.get('/users/:id', (req, res) => {
    const u = getUserById(Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found' });
    const me = req.user;
    const matches = listMatchesByUser(u.id, { limit: 30 });
    res.json({
      user: serializeUser(u),
      followers: countFollowers(u.id),
      following: followingIds(u.id).length,
      isFollowing: me ? isFollowing(me.id, u.id) : false,
      matches: summarizeList(matches),
      stats: userStats(u.id),
    });
  });

  api.post('/users/:id/follow', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const target = Number(req.params.id);
    if (target === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself' });
    followUser(req.user.id, target);
    res.json({ ok: true, followers: countFollowers(target) });
  });

  api.delete('/users/:id/follow', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    unfollowUser(req.user.id, Number(req.params.id));
    res.json({ ok: true, followers: countFollowers(Number(req.params.id)) });
  });

  // Matches
  api.get('/matches', (req, res) => {
    const sport = req.query.sport || null;
    const status = req.query.status || null;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const list = listMatches({ sport, status, limit, offset });
    res.json({ matches: summarizeList(list) });
  });

  api.get('/matches/following/live', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    res.json({ matches: summarizeList(listMatchesByFollowed(req.user.id)) });
  });

  api.post('/matches', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const body = req.body || {};
    const { sport, sides } = body;
    if (!SPORTS[sport]) return res.status(400).json({ error: 'Unknown sport' });
    if (!sides || !Array.isArray(sides.a) || !Array.isArray(sides.b)) {
      return res.status(400).json({ error: 'Provide sides.a and sides.b arrays' });
    }
    if ((sides.a.length === 0 || sides.b.length === 0) || sides.a.length > 2 || sides.b.length > 2) {
      return res.status(400).json({ error: 'Each side must have 1 or 2 players' });
    }

    // Resolve names / ensure users exist. Entries may be a numeric user id or a
    // username handle (with or without a leading @).
    const resolvePlayer = (entry) => {
      const s = String(entry).trim();
      if (/^\d+$/.test(s)) return getUserById(Number(s));
      return getUserByUsername(s.startsWith('@') ? s.slice(1) : s);
    };
    const resolveSide = (arr) => {
      return arr.map((id) => {
        const u = resolvePlayer(id);
        if (!u) throw new Error('bad_user');
        return u;
      });
    };
    let sideA, sideB;
    try {
      sideA = resolveSide(sides.a);
      sideB = resolveSide(sides.b);
    } catch {
      return res.status(400).json({ error: 'One or more players do not exist' });
    }

    const nameFor = (users) =>
      users.length === 1 ? users[0].name : users.map((x) => x.name).join(' & ');

    const id = randomUUID();

    // Per-match format override (sets family = sets to win; points family =
    // games to win). Optional — defaults to the sport's rule.
    const cfg = SPORTS[sport];
    const opts = {};
    const sets = Number(body.sets);
    const games = Number(body.games);
    if (cfg.family === 'sets') {
      if (!Number.isNaN(sets)) {
        if (!Number.isInteger(sets) || sets < 1 || sets > 8) {
          return res.status(400).json({ error: 'sets must be an integer from 1 to 8' });
        }
        opts.setsToWin = sets;
      }
    } else if (!Number.isNaN(games)) {
      if (!Number.isInteger(games) || games < 1 || games > 15) {
        return res.status(400).json({ error: 'games must be an integer from 1 to 15' });
      }
      opts.gamesToWin = games;
    }

    // Coin toss: toss.winner chooses who serves first (default: toss winner).
    const toss = body.toss || {};
    if (toss.winner != null) {
      if (toss.winner !== 0 && toss.winner !== 1) {
        return res.status(400).json({ error: 'toss.winner must be 0 or 1' });
      }
    }
    let serverFirst = opts.serverFirst;
    if (toss.serverFirst != null) {
      if (toss.serverFirst !== 0 && toss.serverFirst !== 1) {
        return res.status(400).json({ error: 'toss.serverFirst must be 0 or 1' });
      }
      serverFirst = toss.serverFirst;
    } else if (toss.winner != null) {
      serverFirst = toss.winner;
    }
    if (serverFirst != null) opts.serverFirst = serverFirst;

    // Pre-match detailing: venue, court/surface, conditions (all optional).
    const pre = body.preMatch || {};
    const txt = (v, max) => {
      if (v == null) return null;
      const s = String(v).trim().slice(0, max);
      return s || null;
    };
    const preMatch = {
      started: false,
      venue: txt(pre.venue, 80),
      court: txt(pre.court, 60),
      conditions: txt(pre.conditions, 160),
      tossWinner: toss.winner != null ? toss.winner : null,
      serverFirst: serverFirst != null ? serverFirst : null,
      format:
        cfg.family === 'sets'
          ? opts.setsToWin || null
          : opts.gamesToWin || null,
    };

    const state = initialState(sport, [nameFor(sideA), nameFor(sideB)], opts);
    createMatch({ id, sport, state: stripHistory(state), createdBy: req.user.id, preMatch });

    sideA.forEach((u, i) => addMatchPlayer(id, u.id, 0, i));
    sideB.forEach((u, i) => addMatchPlayer(id, u.id, 1, i));
    addScorer(id, req.user.id); // the creator starts as the scorer
    addEvent(id, `${SPORTS[sport].name} match created`, req.user.id);
    if (preMatch.tossWinner != null) {
      const first = preMatch.serverFirst === 0 ? sideA : sideB;
      addEvent(id, `🪙 Toss — ${nameFor(first)} will serve first`, req.user.id);
    }

    const full = getMatch(id);
    broadcast('feed'); // tell feed subscribers to refresh
    res.json({ match: matchSummary(full), full });
  });

  api.get('/matches/:id', (req, res) => {
    const m = getMatch(req.params.id);
    if (!m) return res.status(404).json({ error: 'Match not found' });
    res.json({
      match: matchSummary(m),
      state: stripHistory(m.state),
      players: m.players,
      scorers: m.scorers,
      events: getEvents(m.id),
      preMatch: m.preMatch,
      started: matchStarted(m.id),
      canScore: req.user ? canScore(m.id, req.user.id) : false,
      canStart: req.user ? isCreatorOf(m.id, req.user.id) && !matchStarted(m.id) : false,
    });
  });

  // Credibility: only the match creator can move a pre-game match to "live".
  api.post('/matches/:id/start', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const m = getMatch(req.params.id);
    if (!m) return res.status(404).json({ error: 'Match not found' });
    if (matchStarted(m.id)) return res.status(409).json({ error: 'Match already started' });
    if (m.status === 'finished') return res.status(409).json({ error: 'Match already finished' });
    if (!isCreatorOf(m.id, req.user.id)) {
      return res.status(403).json({ error: 'Only the match creator can start this match' });
    }
    setMatchStarted(m.id);
    addEvent(m.id, '🎾 Match started', req.user.id);
    broadcast(`match:${m.id}`);
    broadcast('feed');
    const full = getMatch(m.id);
    res.json({ ok: true, match: matchSummary(full), full });
  });

  // Invite an extra scorer (creator only). Scorers may operate the scoreboard.
  api.post('/matches/:id/scorer', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const m = getMatch(req.params.id);
    if (!m) return res.status(404).json({ error: 'Match not found' });
    if (!isCreatorOf(m.id, req.user.id)) {
      return res.status(403).json({ error: 'Only the match creator can add scorers' });
    }
    if (isCreatorOf(m.id, Number(userId)) || isScorerOf(m.id, Number(userId))) {
      return res.status(400).json({ error: 'That user already scores this match' });
    }
    addScorer(m.id, Number(userId));
    addEvent(m.id, `🔧 Scorer added`, req.user.id);
    broadcast(`match:${m.id}`);
    res.json({ ok: true, scorers: getMatch(m.id).scorers });
  });

  api.post('/matches/:id/action', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const result = await processMatchAction(req.params.id, req.body?.action, req.user, broadcast);
    if (result.error) return res.status(result.code || 400).json({ error: result.error });
    res.json(result);
  });

  api.get('/matches/:id/events', (req, res) => {
    res.json({ events: getEvents(req.params.id) });
  });

  // ---- Tournaments -----------------------------------------------------------

  // Shared shape for tournament responses (bracket resolved for live ones).
  const summarizeTournament = (t, viewer) => {
    const players = getTournamentPlayers(t.id).map((p) => ({
      id: p.userId,
      name: p.name,
      username: p.username,
      avatar: p.avatar,
      seed: p.seed,
    }));
    const view =
      t.status === 'draft' ? null : fixtureView(t.id, getFixtures(t.id));
    const isCreator = viewer && isTournamentCreator(t.id, viewer.id);
    const isPlayer = viewer && isTournamentPlayer(t.id, viewer.id);
    return {
      id: t.id,
      name: t.name,
      sport: t.sport,
      icon: SPORTS[t.sport]?.icon || '🏆',
      sportName: SPORTS[t.sport]?.name || t.sport,
      visibility: t.visibility,
      status: t.status,
      createdAt: t.created_at,
      creator: { id: t.creator?.id, name: t.creator?.name, username: t.creator?.username },
      winner: t.winner ? { id: t.winner.id, name: t.winner.name } : null,
      players,
      rounds: view ? view.rounds : [],
      champion: view ? view.champion : null,
      canStart: t.status === 'draft' && isCreator && players.length >= 2,
      canJoin: t.status === 'draft' && viewer && !isPlayer,
      myRole: isCreator ? 'creator' : isPlayer ? 'player' : null,
    };
  };

  api.get('/tournaments', (req, res) => {
    const viewerId = req.user?.id ?? -1;
    const tournaments = listTournamentsForUser(viewerId).map((t) =>
      summarizeTournament(getTournamentById(t.id), req.user)
    );
    res.json({ tournaments });
  });

  api.post('/tournaments', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const { name, sport, visibility } = req.body || {};
    const nm = String(name || '').trim();
    if (!nm || nm.length > 80) return res.status(400).json({ error: 'Give the tournament a short name' });
    if (!SPORTS[sport]) return res.status(400).json({ error: 'Unknown sport' });
    const t = createTournament({
      name: nm,
      sport,
      visibility: visibility === 'private' ? 'private' : 'public',
      creatorId: req.user.id,
    });
    addTournamentPlayer(t.id, req.user.id); // the creator is player #1
    res.json({ tournament: summarizeTournament(t, req.user) });
  });

  api.get('/tournaments/:id', (req, res) => {
    const t = getTournamentById(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    res.json({ tournament: summarizeTournament(t, req.user) });
  });

  // Add players by username (creator, draft only).
  api.post('/tournaments/:id/participants', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const t = getTournamentById(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    if (!isTournamentCreator(t.id, req.user.id)) {
      return res.status(403).json({ error: 'Only the creator can add players' });
    }
    if (t.status !== 'draft') {
      return res.status(400).json({ error: 'The draw already started' });
    }
    const list = Array.isArray(req.body?.usernames) ? req.body.usernames : [];
    const added = [];
    const invalid = [];
    for (const raw of list) {
      const { user, matches } = resolveUserEntry(raw);
      if (!user) {
        const entry = String(raw).trim();
        invalid.push(
          matches > 1
            ? `${entry} (${matches} players match — use a full @username)`
            : entry
        );
        continue;
      }
      if (addTournamentPlayer(t.id, user.id)) added.push(user);
    }
    res.json({
      tournament: summarizeTournament(getTournamentById(t.id), req.user),
      added: added.map((u) => ({ id: u.id, name: u.name, username: u.username })),
      invalid,
    });
  });

  // A logged-in user joins by themselves (draft only).
  api.post('/tournaments/:id/join', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const t = getTournamentById(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    if (t.status !== 'draft') {
      return res.status(400).json({ error: 'The draw already started' });
    }
    const ok = addTournamentPlayer(t.id, req.user.id);
    res.json({ tournament: summarizeTournament(getTournamentById(t.id), req.user), joined: ok });
  });

  // Creator locks the field and draws the bracket (random seeding).
  api.post('/tournaments/:id/start', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const t = getTournamentById(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    if (!isTournamentCreator(t.id, req.user.id)) {
      return res.status(403).json({ error: 'Only the creator can start the tournament' });
    }
    if (t.status !== 'draft') {
      return res.status(400).json({ error: 'The tournament already started' });
    }
    const count = getTournamentPlayers(t.id).length;
    if (count < 2) {
      return res.status(400).json({ error: 'Need at least 2 players' });
    }
    buildBracket(t.id);
    setTournamentStatus(t.id, 'live');
    res.json({ tournament: summarizeTournament(getTournamentById(t.id), req.user) });
  });

  // Open the linked live match for a fixture. Any participant (or the creator)
  // can kick it off; the player who does becomes the match's scorer.
  api.post('/fixtures/:id/start-match', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const fx = getFixtureById(Number(req.params.id));
    if (!fx) return res.status(404).json({ error: 'Fixture not found' });
    const t = getTournamentById(fx.tournament_id);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    if (t.status !== 'live') {
      return res.status(400).json({ error: 'Tournament is not live' });
    }
    if (fx.status !== 'scheduled' || fx.match_id) {
      return res.status(400).json({ error: 'This fixture already has a match' });
    }
    if (!isTournamentCreator(t.id, req.user.id) && !isTournamentPlayer(t.id, req.user.id)) {
      return res.status(403).json({ error: 'You are not in this tournament' });
    }
    const view = fixtureView(t.id, getFixtures(t.id));
    const node = view.rounds
      .flatMap((r) => r.fixtures)
      .find((f) => f.id === fx.id);
    if (!node || !node.player1 || !node.player2) {
      return res.status(400).json({ error: 'This fixture needs two players (no bye here)' });
    }

    const [a, b] = [node.player1, node.player2];
    const id = randomUUID();
    const state = initialState(t.sport, [a.name, b.name]);
    createMatch({ id, sport: t.sport, state: stripHistory(state), createdBy: req.user.id });
    addMatchPlayer(id, a.id, 0, 0);
    addMatchPlayer(id, b.id, 1, 0);
    addScorer(id, req.user.id); // whoever opened it scores it
    addEvent(id, `${SPORTS[t.sport].name} · ${t.name} bracket match`, req.user.id);
    setFixtureMatch(fx.id, id);
    res.json({ matchId: id, tournament: summarizeTournament(getTournamentById(t.id), req.user) });
  });

  return api;
}

// ---- User stats ---------------------------------------------------------------

export function userStats(userId) {
  const matches = listMatchesByUser(userId, { limit: 500 }).filter(
    (m) => m.status === 'finished'
  );
  const perSport = {};
  let total = { played: 0, wins: 0, losses: 0 };

  for (const m of matches) {
    const s = m.state;
    const sideOf = m.players.find((p) => p.userId === userId)?.side;
    if (sideOf === undefined || sideOf === null) continue;
    const won = s.winnerIdx === sideOf;
    const key = m.sport;
    if (!perSport[key]) perSport[key] = { played: 0, wins: 0, losses: 0 };
    perSport[key].played += 1;
    if (won) perSport[key].wins += 1;
    else perSport[key].losses += 1;

    total.played += 1;
    if (won) total.wins += 1;
    else total.losses += 1;
  }

  const withPct = (x) => ({
    ...x,
    winPct: x.played ? Math.round((100 * x.wins) / x.played) : 0,
  });

  const bySport = Object.fromEntries(
    Object.entries(perSport).map(([k, v]) => [k, withPct(v)])
  );
  return { total: withPct(total), bySport };
}
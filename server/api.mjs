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
  getUserById,
  serializeUser,
  isPlayerOf,
  isCreatorOf,
  isScorerOf,
  addScorer,
  confirmResult,
} from './db.mjs';
import { initialState, apply, getDisplay, stripHistory } from '../src/lib/engine.js';
import { SPORTS } from '../src/lib/sports.js';
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
  issuePhoneCode,
  verifyPhoneCode,
  isPhonePurpose,
  normalizePhone,
  isPhoneOk,
} from './otp.mjs';
import { findOrCreateOAuthUser, getUserByPhone, markPhoneVerified, setUserPhone } from './db.mjs';
import {
  googleConfigured,
  newOAuthState,
  consumeOAuthState,
  googleAuthUrl,
  exchangeGoogleCode,
  BASE_URL,
} from './google.mjs';

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
  const suspicious = finished && durationMinutes !== null && durationMinutes < 1;

  return {
    id: m.id,
    sport: m.sport,
    sportName: sport.name,
    icon: sport.icon,
    status: m.status,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    finishedAt: m.finishedAt,
    resultConfirmed: !!m.resultConfirmed,
    durationMinutes,
    suspicious,
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
  };
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

  return enqueue(matchId, () => {
    const before = fullStateOf(matchId);
    const next = runAction(before, action);
    if (next.error) return next;
    liveStates.set(matchId, next);
    saveMatchState(matchId, stripHistory(next), { finish: next.matchOver });

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

  // Phone OTP: send a code to a number, then verify it.
  api.post('/phone/send', async (req, res) => {
    const { phone, purpose } = req.body || {};
    if (!isPhonePurpose(purpose)) {
      return res.status(400).json({ error: 'Invalid purpose' });
    }
    const p = normalizePhone(phone);
    if (!isPhoneOk(p)) {
      return res.status(400).json({ error: 'Enter a valid phone number (e.g. +91 98765 43210 or 98765 43210).' });
    }
    if (purpose === 'login' && !getUserByPhone(p)) {
      return res.status(400).json({ error: 'No account is registered with that number yet. Sign up first.' });
    }
    if (purpose === 'verify_own') {
      if (!req.user) return res.status(401).json({ error: 'Not logged in' });
      const taken = getUserByPhone(p);
      if (taken && taken.id !== req.user.id) {
        return res.status(409).json({ error: 'That number is already linked to another account' });
      }
    }
    try {
      const out = await issuePhoneCode(p, purpose);
      if (out.error) return res.status(out.code || 400).json({ error: out.error });
      return res.json({ ok: true, phone: p, ...(out.devCode ? { devCode: out.devCode } : {}) });
    } catch {
      return res.status(502).json({ error: 'Could not send the SMS right now.' });
    }
  });

  api.post('/phone/verify', (req, res) => {
    const { phone, purpose, code } = req.body || {};
    const out = verifyPhoneCode(phone, purpose, code);
    if (out.error) return res.status(out.code || 400).json({ error: out.error });

    if (purpose === 'login') {
      return res.json({ ok: true, user: startSession(req, res, out.user) });
    }

    if (purpose === 'verify_own') {
      if (!req.user) return res.status(401).json({ error: 'Not logged in' });
      const taken = getUserByPhone(out.phone);
      if (taken && taken.id !== req.user.id) {
        return res.status(409).json({ error: 'That number is already linked to another account' });
      }
      setUserPhone(req.user.id, out.phone);
      return res.json({ ok: true, user: serializeUser(getUserById(req.user.id)) });
    }

    // register: mark the just-created account's phone verified
    const u = getUserByPhone(out.phone);
    if (!u) return res.status(400).json({ error: 'No account found for that number.' });
    markPhoneVerified(u.id);
    return res.json({ ok: true, user: serializeUser(getUserById(u.id)) });
  });

  // Google Sign in
  api.get('/auth/google/config', (_req, res) => {
    res.json({ available: googleConfigured() });
  });

  api.get('/auth/google', (req, res) => {
    if (!googleConfigured()) {
      return res
        .status(503)
        .json({ error: 'Google sign-in is not configured on this server yet.' });
    }
    const state = newOAuthState();
    res.redirect(googleAuthUrl(state));
  });

  api.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query || {};
    if (!code || !state || !consumeOAuthState(String(state))) {
      return res.status(400).send('Invalid or expired sign-in request. Please try again.');
    }
    try {
      const { email, name, sub } = await exchangeGoogleCode(String(code));
      const { user } = findOrCreateOAuthUser({ provider: 'google', sub, email, name });
      startSession(req, res, user);
      return res.redirect(BASE_URL + '/');
    } catch (e) {
      return res
        .status(400)
        .redirect(`${BASE_URL}/login?error=${encodeURIComponent(e.message)}`);
    }
  });

  // Users / players
  api.get('/users', (req, res) => {
    const q = String(req.query.q || '').trim();
    res.json({ users: searchUsers(q, 8) });
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
    const { sport, sides } = req.body || {};
    if (!SPORTS[sport]) return res.status(400).json({ error: 'Unknown sport' });
    if (!sides || !Array.isArray(sides.a) || !Array.isArray(sides.b)) {
      return res.status(400).json({ error: 'Provide sides.a and sides.b arrays' });
    }
    if ((sides.a.length === 0 || sides.b.length === 0) || sides.a.length > 2 || sides.b.length > 2) {
      return res.status(400).json({ error: 'Each side must have 1 or 2 players' });
    }

    // Resolve names / ensure users exist
    const resolveSide = (arr) => {
      return arr.map((id) => {
        const u = getUserById(Number(id));
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
    const state = initialState(sport, [nameFor(sideA), nameFor(sideB)]);
    createMatch({ id, sport, state: stripHistory(state), createdBy: req.user.id });

    sideA.forEach((u, i) => addMatchPlayer(id, u.id, 0, i));
    sideB.forEach((u, i) => addMatchPlayer(id, u.id, 1, i));
    addScorer(id, req.user.id); // the creator starts as the scorer
    addEvent(id, `${SPORTS[sport].name} match created`, req.user.id);

    const full = getMatch(id);
    broadcast('feed'); // tell feed subscribers to refresh
    res.json({ match: matchSummary(full), full });
  });

  api.get('/matches/:id', (req, res) => {
    const m = getMatch(req.params.id);
    if (!m) return res.status(404).json({ error: 'Match not found' });
    const confirmInfo = {
      required: m.players.map((p) => ({ id: p.userId, name: p.name })),
      done: m.players
        .filter((p) => p.confirmedAt)
        .map((p) => ({ id: p.userId, name: p.name })),
      allConfirmed: m.resultConfirmed,
    };
    res.json({
      match: matchSummary(m),
      state: stripHistory(m.state),
      players: m.players,
      scorers: m.scorers,
      events: getEvents(m.id),
      confirmInfo,
      canScore: req.user ? canScore(m.id, req.user.id) : false,
      canConfirm:
        req.user &&
        (isPlayerOf(m.id, req.user.id) || isCreatorOf(m.id, req.user.id)),
    });
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

  // A player (or creator) confirms the final result agreed with everyone.
  api.post('/matches/:id/confirm', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in' });
    const m = getMatch(req.params.id);
    if (!m) return res.status(404).json({ error: 'Match not found' });
    if (m.status !== 'finished') {
      return res.status(400).json({ error: 'The match is not finished yet' });
    }
    if (!isPlayerOf(m.id, req.user.id) && !isCreatorOf(m.id, req.user.id)) {
      return res.status(403).json({ error: 'Only players or the creator can confirm' });
    }
    const allConfirmed = confirmResult(m.id, req.user.id);
    broadcast('feed');
    broadcast(`match:${m.id}`);
    res.json({ ok: true, allConfirmed, resultConfirmed: allConfirmed });
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

  return api;
}

// ---- User stats ---------------------------------------------------------------

export function userStats(userId) {
  const matches = listMatchesByUser(userId, { limit: 500 }).filter(
    (m) => m.status === 'finished' && m.resultConfirmed
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
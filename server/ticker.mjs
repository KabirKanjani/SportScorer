// Simulated live playout for the demo world (SEED_DEMO=1).
//
// A background timer that "plays" the seeded demo tennis / club matches and the
// demo tournaments forward through the real scoring engine, so the site always
// shows moving scores, finishing matches and a progressing bracket without
// needing a live data feed. It only ever touches demo-owned content:
//   - live matches whose id starts with demo_live_, usopen_live_ or seed_live_
//   - tournaments whose creator is one of the sample players
// Real-user matches/tournaments are never touched.

import { db } from './db.mjs';
import {
  getMatch,
  getTournamentById,
  getFixtures,
  getGroupFixtures,
  getFixtureByMatch,
  getUserByUsername,
  createMatch,
  addMatchPlayer,
  addScorer,
  addEvent,
  saveMatchState,
  setFixtureMatch,
  createTournament,
  addTournamentPlayer,
  setTournamentStatus,
} from './db.mjs';
import { startGroupPlayoffs, fixtureView, onFixtureMatchFinished } from './tournament.mjs';
import { initialState, apply, stripHistory } from '../src/lib/engine.js';
import { SPORTS } from '../src/lib/sports.js';

const TICK_MS = Number(process.env.LIVE_TICK_MS) || 3000;
const DEMO_LIVE_TARGET = 4;
const POINT_BIAS = 0.62; // favored player wins a point roughly this often

export { TICK_MS };

// Live US Open demo matchups. Winners pick up the next plausible big match on
// the card; once the rotation is exhausted the matchups replay as "rounds".
const USOPEN_LIVE_ROTATION = [
  { a: 'zverev', b: 'tiafoe', setsToWin: 3 },
  { a: 'gauff', b: 'rybakina', setsToWin: 2 },
  { a: 'alcaraz', b: 'medvedev', setsToWin: 3 },
  { a: 'swiatek', b: 'sabalenka', setsToWin: 2 },
  { a: 'lehecka', b: 'djokovic', setsToWin: 3 },
  { a: 'pegula', b: 'kenin', setsToWin: 2 },
];

// Club-style demo live pairings (reused across sports, may replay as editions).
const DEMO_LIVE_SCRIPTS = [
  { sport: 'padel', a: 'triay', b: 'josemaria' },
  { sport: 'pickleball', a: 'staksrud', b: 'parenteau' },
  { sport: 'tabletennis', a: 'itomima', b: 'chenmeng' },
  { sport: 'squash', a: 'farag', b: 'elhammamy' },
  { sport: 'badminton', a: 'momota', b: 'antonsen' },
  { sport: 'racquetball', a: 'carson', b: 'longoria' },
];

// Deterministic-ish per-match favorite so matches progress and finish.
function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function feedId(id) {
  return ['demo_live_', 'usopen_live_', 'seed_live_'].some((p) => id.startsWith(p));
}

function countMatches(pattern) {
  return db.prepare(`SELECT COUNT(*) AS c FROM match WHERE id LIKE ?`).get(pattern).c;
}

// Live match count for a given id prefix (finished ones don't count once
// replenishment should kick back in).
function countLive(pattern) {
  return db.prepare(`SELECT COUNT(*) AS c FROM match WHERE id LIKE ? AND status = 'live'`).get(pattern).c;
}

function sampleUserId(username) {
  return getUserByUsername(username)?.id || null;
}

function samplePlayerIds() {
  const usernames = [
    'alcaraz', 'zverev', 'djokovic', 'medvedev', 'tiafoe', 'lehecka', 'paul',
    'bublik', 'navone', 'safiullin', 'gaston', 'carrenobusta', 'wong', 'jjwolf',
    'damm', 'sonego', 'swiatek', 'sabalenka', 'pegula', 'gauff', 'rybakina',
    'kenin', 'venusw', 'anisimova', 'enavarro', 'svitolina', 'kostyuk', 'bucsa',
    'wangxiyu', 'osorio', 'sierra', 'ruse', 'coello', 'tapia', 'dinenno',
    'pnavarro', 'lebron', 'galan', 'arianas', 'josemaria', 'triay', 'salazar',
    'farag', 'elshoragy', 'elsherbini', 'elhammamy', 'waselenchuk', 'carson',
    'longoria', 'mjvargas', 'benjohns', 'staksrud', 'alw', 'parenteau',
    'malong', 'fanzhendong', 'wangchuqin', 'xuxin', 'chenmeng', 'sunyingsha',
    'itomima', 'axelsen', 'momota', 'vitidsarn', 'antonsen', 'anseyoung',
    'taitzuying', 'marin',
  ];
  return new Set(usernames.map(sampleUserId).filter(Boolean));
}

let SAMPLE_IDS = null;
function sampleIds() {
  if (!SAMPLE_IDS) SAMPLE_IDS = samplePlayerIds();
  return SAMPLE_IDS;
}

// Advance one demo match one point (or finish it). Returns true if it finished.
function tickMatch(id, broadcast) {
  const m = getMatch(id);
  if (!m || m.status !== 'live' || !feedId(m.id)) return false;

  const fav = stableHash(id) % 2;
  const pick = Math.random() < POINT_BIAS ? fav : 1 - fav;
  const next = apply(m.state, { type: 'point', player: pick });
  const over = next.matchOver;

  saveMatchState(id, stripHistory(next), { finish: over });
  if (over) {
    addEvent(id, `Match finished · ${m.players.find((p) => p.pos === 0)?.name ?? ''} wins`, m.createdBy);
    const fx = getFixtureByMatch(id);
    if (fx) {
      const win = m.players.find((p) => p.side === next.winnerIdx && p.pos === 0);
      onFixtureMatchFinished(id, win?.userId ?? m.createdBy);
    }
    broadcast('feed');
  }

  broadcast(`match:${id}`);
  return over;
}

// Fresh live state for a pair of names using the requested sport.
function freshState(sport, names, setsToWin) {
  let s = initialState(sport, names, setsToWin ? { setsToWin } : undefined);
  return stripHistory(s);
}

// Create a live demo match (id is caller-provided; already-checked unique).
function spawnLiveMatch({ id, sport, a, b, setsToWin, createdBy }) {
  const ua = getUserByUsername(a);
  const ub = getUserByUsername(b);
  if (!ua || !ub) return null;
  const state = freshState(sport, [ua.name, ub.name], setsToWin);
  createMatch({ id, sport, state, createdBy });
  addMatchPlayer(id, ua.id, 0, 0);
  addMatchPlayer(id, ub.id, 1, 0);
  addScorer(id, createdBy);
  addEvent(id, `${SPORTS[sport].name} match created`, createdBy);
  addEvent(id, 'Match started', createdBy);
  saveMatchState(id, state, { finish: false });
  return id;
}

// Exactly one live US Open match at all times; pick the next matchup that has
// no match row yet, then replay as `_2`, `_3`, … editions.
function replenishUsOpen(broadcast) {
  if (countLive('usopen_live_%') > 0) return;
  let def = USOPEN_LIVE_ROTATION.find((d) => !db.prepare('SELECT 1 FROM match WHERE id = ?').get(`usopen_live_${d.a}_${d.b}`));
  let id;
  if (def) {
    id = `usopen_live_${def.a}_${def.b}`;
  } else {
    def = USOPEN_LIVE_ROTATION[0];
    const n = countMatches(`usopen_live_${def.a}_${def.b}%`);
    id = `usopen_live_${def.a}_${def.b}_${n + 1}`;
  }
  const aid = sampleUserId(def.a);
  const created = aid || sampleUserId(def.b);
  if (spawnLiveMatch({ id, sport: 'tennis', a: def.a, b: def.b, setsToWin: def.setsToWin, createdBy: created })) {
    broadcast('feed');
  }
}

// Keep a healthy live pool of club demo matches even after matches finish.
function replenishDemoLive(broadcast) {
  let liveCount = countLive('demo_live_%');
  if (liveCount >= DEMO_LIVE_TARGET) return;
  for (const scr of DEMO_LIVE_SCRIPTS) {
    if (liveCount >= DEMO_LIVE_TARGET) break;
    const base = `demo_live_${scr.a}_${scr.b}`;
    if (db.prepare('SELECT 1 FROM match WHERE id = ? AND status = ?').get(base, 'live')) continue;
    const n = countMatches(`${base}%`);
    const id = n === 0 ? base : `${base}_${n + 1}`;
    const created = sampleUserId(scr.a) || sampleUserId(scr.b);
    if (spawnLiveMatch({ id, sport: scr.sport, a: scr.a, b: scr.b, createdBy: created })) {
      broadcast('feed');
      liveCount += 1;
    }
  }
}

// Open live matches for demo tournaments that are in the 'live' status but have
// scheduled fixtures waiting for a linked match (group fixtures first, then the
// playoff bracket once it has been seeded). One fixture per tick to keep the
// bracket progressing at a watchable pace.
function autoStartDemoFixtureMatches(broadcast) {
  const rows = db.prepare(`SELECT id FROM tournament WHERE status = 'live'`).all();
  for (const { id: tid } of rows) {
    const t = getTournamentById(tid);
    if (!t || !sampleIds().has(t.creator_id)) continue;

    const group = getGroupFixtures(tid);
    let playable = group.filter((f) => f.player1 && f.player2 && !f.matchId && f.status === 'scheduled');
    if (playable.length === 0) {
      const view = fixtureView(tid, getFixtures(tid));
      playable = view.rounds
        .flatMap((r) => r.fixtures)
        .filter((f) => f.player1 && f.player2 && !f.matchId && !f.isBye && f.status === 'scheduled');
    }
    if (!playable.length) continue;

    const fx = playable[0];
    const [a, b] = [fx.player1, fx.player2];
    const id = `seed_live_t${tid}_f${fx.id}`;
    if (db.prepare('SELECT 1 FROM match WHERE id = ?').get(id)) continue;

    const state = freshState(t.sport, [a.name, b.name]);
    createMatch({ id, sport: t.sport, state, createdBy: t.creator_id });
    const addSide = (user, side) => {
      addMatchPlayer(id, user.id, side, 0);
      if (user.partner) addMatchPlayer(id, user.partner.id, side, 1);
    };
    addSide(a, 0);
    addSide(b, 1);
    addScorer(id, t.creator_id);
    addEvent(id, `${SPORTS[t.sport].name} · ${t.name} bracket match`, t.creator_id);
    setFixtureMatch(fx.id, id);
    broadcast('feed');
    return; // one new fixture match per tick
  }
}

// Demo tournaments eventually crown a champion; keep the demo world alive by
// opening a fresh season once no demo tournament is running anymore.
function ensureLiveDemoTournament(broadcast) {
  const rows = db.prepare(`SELECT id FROM tournament WHERE status = 'live'`).all();
  for (const { id: tid } of rows) {
    const t = getTournamentById(tid);
    if (t && sampleIds().has(t.creator_id)) return;
  }

  const baseName = 'Weekend Club Open · Pickleball · Season';
  const existing = db.prepare(`SELECT COUNT(*) AS c FROM tournament WHERE name LIKE ?`).get(`${baseName} %`).c;
  const t = createTournament({
    name: `Weekend Club Open · Pickleball · Season ${existing + 1}`,
    sport: 'pickleball',
    visibility: 'public',
    creatorId: sampleUserId('benjohns'),
  });
  for (const u of ['benjohns', 'staksrud', 'alw', 'parenteau']) {
    addTournamentPlayer(t.id, sampleUserId(u));
  }
  setTournamentStatus(t.id, 'live');
  startGroupPlayoffs(t.id);
  broadcast('feed');
}

function runTick(broadcast) {
  const ids = db
    .prepare(`SELECT id FROM match WHERE status = 'live' AND (id LIKE 'demo_live_%' OR id LIKE 'usopen_live_%' OR id LIKE 'seed_live_%')`)
    .all()
    .map((r) => r.id);
  for (const id of ids) tickMatch(id, broadcast);
  replenishUsOpen(broadcast);
  replenishDemoLive(broadcast);
  autoStartDemoFixtureMatches(broadcast);
  ensureLiveDemoTournament(broadcast);
}

export function startLiveTicker({ broadcast = () => {} } = {}) {
  runTick(broadcast); // prime immediately so the demo is live on boot
  return setInterval(() => {
    try {
      runTick(broadcast);
    } catch (e) {
      console.warn(`[ticker] tick failed: ${e.message}`);
    }
  }, TICK_MS);
}
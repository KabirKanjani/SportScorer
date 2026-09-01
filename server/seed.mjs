// Sample player accounts so fresh deployments aren't empty.
// Tennis players mirror the real 2026 US Open roster and matches (bo5/bo3
// scores come straight from rounds 1–2 of the live event). The other sports use
// real top players of that sport with simulated club-style results.

import { pathToFileURL } from 'node:url';
import { hashPassword } from './auth.mjs';
import { createUser, getUserByEmail, setUserAvatar, db } from './db.mjs';
import {
  createMatch,
  addMatchPlayer,
  addScorer,
  addEvent,
  saveMatchState,
  getUserByUsername,
  createTournament,
  addTournamentPlayer,
  setTournamentStatus,
  setFixtureMatch,
  getFixtures,
  followUser,
  getTournamentById,
} from './db.mjs';
import { buildBracket, startGroupPlayoffs, fixtureView, onFixtureMatchFinished } from './tournament.mjs';
import { initialState, apply, stripHistory } from '../src/lib/engine.js';
import { SPORTS } from '../src/lib/sports.js';

const BOT_PASSWORD = 'sample123';

const W = 'https://upload.wikimedia.org/wikipedia/commons/thumb';

// Real photos from Wikimedia (Wikipedia infobox images). Players without a
// usable photo fall back to illustrated DiceBear avatars.
const PHOTOS = {
  alcaraz: `${W}/d/d4/25th_Laureus_World_Sports_Awards_-_Red_Carpet_-_Carlos_Alcaraz_-_240422_192324_%28cropped%29.jpg/330px-25th_Laureus_World_Sports_Awards_-_Red_Carpet_-_Carlos_Alcaraz_-_240422_192324_%28cropped%29.jpg`,
  federer: `${W}/1/11/Roger_Federer_2015_%28cropped%29.jpg/330px-Roger_Federer_2015_%28cropped%29.jpg`,
  swiatek: `${W}/9/98/Iga_Swiatek_2023_Cropped_%2B_Retouched.jpg/330px-Iga_Swiatek_2023_Cropped_%2B_Retouched.jpg`,
  serenaw: `${W}/2/2f/Guests_at_the_2026_Met_Gala_209_%28cropped%29.jpg/330px-Guests_at_the_2026_Met_Gala_209_%28cropped%29.jpg`,
  sabalenka: `${W}/a/a4/Aryna_Sabalenka_US_Open_2024_practice_%28cropped%29.jpg/330px-Aryna_Sabalenka_US_Open_2024_practice_%28cropped%29.jpg`,
  coello: `${W}/5/5e/Arturo_Coello_%28cropped%29.jpg/330px-Arturo_Coello_%28cropped%29.jpg`,
  tapia: `${W}/5/5a/Augustin_Tapia_%28cropped%29.jpg/330px-Augustin_Tapia_%28cropped%29.jpg`,
  josemaria: `${W}/8/8c/Paula_Juanmaria.jpg/330px-Paula_Juanmaria.jpg`,
  farag: `${W}/3/32/Ali_Farag_at_the_2023-24_PSA_World_Tour_Finals-06.jpg/330px-Ali_Farag_at_the_2023-24_PSA_World_Tour_Finals-06.jpg`,
  elshoragy: `${W}/6/6f/Mohamed_Elshorbagy_%282012%29.jpg/330px-Mohamed_Elshorbagy_%282012%29.jpg`,
  elsherbini: `${W}/3/38/Nour_El_Sherbini_at_the_2023-24_PSA_World_Tour_Finals-4_%28cropped%29.jpg/330px-Nour_El_Sherbini_at_the_2023-24_PSA_World_Tour_Finals-4_%28cropped%29.jpg`,
  elhammamy: `${W}/7/78/Hania_El_Hammamy_at_the_2023-24_PSA_World_Tour_Finals-03.jpg/330px-Hania_El_Hammamy_at_the_2023-24_PSA_World_Tour_Finals-03.jpg`,
  waselenchuk: `${W}/6/65/Kane_Waselenchuk_at_2014_US_Open_Racquetball_Championships.jpg/330px-Kane_Waselenchuk_at_2014_US_Open_Racquetball_Championships.jpg`,
  carson: `${W}/a/a9/Rocky_Carson_%282006_Racquetball_World_Championships%29.jpg/330px-Rocky_Carson_%282006_Racquetball_World_Championships%29.jpg`,
  longoria: `${W}/4/4a/Paola_Longoria.png/330px-Paola_Longoria.png`,
  mjvargas: `${W}/d/df/Mar%C3%ADa_Jos%C3%A9_Vargas_KCA_2016.jpg/330px-Mar%C3%ADa_Jos%C3%A9_Vargas_KCA_2016.jpg`,
  benjohns: `${W}/9/98/Ben_Johns_and_Collin_Johns.jpg/330px-Ben_Johns_and_Collin_Johns.jpg`,
  alw: `${W}/b/b2/Anna_Leigh_waters_%28cropped%29.jpg/330px-Anna_Leigh_waters_%28cropped%29.jpg`,
  malong: `${W}/1/1b/Ma_Long_ATTC2017_29.jpeg/330px-Ma_Long_ATTC2017_29.jpeg`,
  fanzhendong: `${W}/9/90/ITTF_World_Tour_2017_German_Open_Fan_Zhendong_03.jpg/330px-ITTF_World_Tour_2017_German_Open_Fan_Zhendong_03.jpg`,
  chenmeng: `${W}/3/37/Chen_Meng.png/330px-Chen_Meng.png`,
  sunyingsha: `${W}/1/16/Sun_Yingsha.png/330px-Sun_Yingsha.png`,
  axelsen: `${W}/a/a9/Viktor_Axelsen_-_Indonesia_Masters_2018.jpg/330px-Viktor_Axelsen_-_Indonesia_Masters_2018.jpg`,
  momota: `${W}/1/19/Kento_Momota_2024.png/330px-Kento_Momota_2024.png`,
  anseyoung: `${W}/0/09/Hangzhou_AsianGames_Team_Korea_05_%28An_Se-young%29.jpg/330px-Hangzhou_AsianGames_Team_Korea_05_%28An_Se-young%29.jpg`,
  taitzuying: `${W}/8/8f/Tai_Tzu-ying_in_2024.jpg/330px-Tai_Tzu-ying_in_2024.jpg`,
};

// Deterministic illustrated portraits (free DiceBear API, no key needed).
const BG = 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,ffd1dc';
function avatarFor(u) {
  if (PHOTOS[u.username]) return PHOTOS[u.username];
  return `https://api.dicebear.com/9.x/${u.gender === 'W' ? 'adventurer' : 'avataaars'}/svg?seed=${u.username}&backgroundColor=${BG}`;
}

const SAMPLE_USERS = [
  // tennis — 2026 US Open roster (all active in this year's event)
  { name: 'Carlos Alcaraz', username: 'alcaraz', sport: 'tennis', gender: 'M' },
  { name: 'Alexander Zverev', username: 'zverev', sport: 'tennis', gender: 'M' },
  { name: 'Novak Djokovic', username: 'djokovic', sport: 'tennis', gender: 'M' },
  { name: 'Daniil Medvedev', username: 'medvedev', sport: 'tennis', gender: 'M' },
  { name: 'Frances Tiafoe', username: 'tiafoe', sport: 'tennis', gender: 'M' },
  { name: 'Jiri Lehecka', username: 'lehecka', sport: 'tennis', gender: 'M' },
  { name: 'Tommy Paul', username: 'paul', sport: 'tennis', gender: 'M' },
  { name: 'Alexander Bublik', username: 'bublik', sport: 'tennis', gender: 'M' },
  { name: 'Mariano Navone', username: 'navone', sport: 'tennis', gender: 'M' },
  { name: 'Roman Safiullin', username: 'safiullin', sport: 'tennis', gender: 'M' },
  { name: 'Hugo Gaston', username: 'gaston', sport: 'tennis', gender: 'M' },
  { name: 'Pablo Carreno Busta', username: 'carrenobusta', sport: 'tennis', gender: 'M' },
  { name: 'Coleman Wong', username: 'wong', sport: 'tennis', gender: 'M' },
  { name: 'J.J. Wolf', username: 'jjwolf', sport: 'tennis', gender: 'M' },
  { name: 'Martin Damm Jr', username: 'damm', sport: 'tennis', gender: 'M' },
  { name: 'Lorenzo Sonego', username: 'sonego', sport: 'tennis', gender: 'M' },
  { name: 'Iga Swiatek', username: 'swiatek', sport: 'tennis', gender: 'W' },
  { name: 'Aryna Sabalenka', username: 'sabalenka', sport: 'tennis', gender: 'W' },
  { name: 'Jessica Pegula', username: 'pegula', sport: 'tennis', gender: 'W' },
  { name: 'Coco Gauff', username: 'gauff', sport: 'tennis', gender: 'W' },
  { name: 'Elena Rybakina', username: 'rybakina', sport: 'tennis', gender: 'W' },
  { name: 'Sofia Kenin', username: 'kenin', sport: 'tennis', gender: 'W' },
  { name: 'Venus Williams', username: 'venusw', sport: 'tennis', gender: 'W' },
  { name: 'Amanda Anisimova', username: 'anisimova', sport: 'tennis', gender: 'W' },
  { name: 'Emma Navarro', username: 'enavarro', sport: 'tennis', gender: 'W' },
  { name: 'Elina Svitolina', username: 'svitolina', sport: 'tennis', gender: 'W' },
  { name: 'Marta Kostyuk', username: 'kostyuk', sport: 'tennis', gender: 'W' },
  { name: 'Cristina Bucsa', username: 'bucsa', sport: 'tennis', gender: 'W' },
  { name: 'Wang Xiyu', username: 'wangxiyu', sport: 'tennis', gender: 'W' },
  { name: 'Camila Osorio', username: 'osorio', sport: 'tennis', gender: 'W' },
  { name: 'Solana Sierra', username: 'sierra', sport: 'tennis', gender: 'W' },
  { name: 'Elena-Gabriela Ruse', username: 'ruse', sport: 'tennis', gender: 'W' },
  // padel
  { name: 'Arturo Coello', username: 'coello', sport: 'padel', gender: 'M' },
  { name: 'Agustin Tapia', username: 'tapia', sport: 'padel', gender: 'M' },
  { name: 'Martin Di Nenno', username: 'dinenno', sport: 'padel', gender: 'M' },
  { name: 'Paquito Navarro', username: 'pnavarro', sport: 'padel', gender: 'M' },
  { name: 'Juan Lebron', username: 'lebron', sport: 'padel', gender: 'M' },
  { name: 'Alejandro Galan', username: 'galan', sport: 'padel', gender: 'M' },
  { name: 'Ariana Sanchez', username: 'arianas', sport: 'padel', gender: 'W' },
  { name: 'Paula Josemaria', username: 'josemaria', sport: 'padel', gender: 'W' },
  { name: 'Gemma Triay', username: 'triay', sport: 'padel', gender: 'W' },
  { name: 'Alejandra Salazar', username: 'salazar', sport: 'padel', gender: 'W' },
  // squash
  { name: 'Ali Farag', username: 'farag', sport: 'squash', gender: 'M' },
  { name: 'Mohamed El Shorbagy', username: 'elshoragy', sport: 'squash', gender: 'M' },
  { name: 'Nour El Sherbini', username: 'elsherbini', sport: 'squash', gender: 'W' },
  { name: 'Hania El Hammamy', username: 'elhammamy', sport: 'squash', gender: 'W' },
  // racquetball
  { name: 'Kane Waselenchuk', username: 'waselenchuk', sport: 'racquetball', gender: 'M' },
  { name: 'Rocky Carson', username: 'carson', sport: 'racquetball', gender: 'M' },
  { name: 'Paola Longoria', username: 'longoria', sport: 'racquetball', gender: 'W' },
  { name: 'Maria Jose Vargas', username: 'mjvargas', sport: 'racquetball', gender: 'W' },
  // pickleball
  { name: 'Ben Johns', username: 'benjohns', sport: 'pickleball', gender: 'M' },
  { name: 'Federico Staksrud', username: 'staksrud', sport: 'pickleball', gender: 'M' },
  { name: 'Anna Leigh Waters', username: 'alw', sport: 'pickleball', gender: 'W' },
  { name: 'Catherine Parenteau', username: 'parenteau', sport: 'pickleball', gender: 'W' },
  // table tennis
  { name: 'Ma Long', username: 'malong', sport: 'tabletennis', gender: 'M' },
  { name: 'Fan Zhendong', username: 'fanzhendong', sport: 'tabletennis', gender: 'M' },
  { name: 'Wang Chuqin', username: 'wangchuqin', sport: 'tabletennis', gender: 'M' },
  { name: 'Xu Xin', username: 'xuxin', sport: 'tabletennis', gender: 'M' },
  { name: 'Chen Meng', username: 'chenmeng', sport: 'tabletennis', gender: 'W' },
  { name: 'Sun Yingsha', username: 'sunyingsha', sport: 'tabletennis', gender: 'W' },
  { name: 'Mima Ito', username: 'itomima', sport: 'tabletennis', gender: 'W' },
  // badminton
  { name: 'Viktor Axelsen', username: 'axelsen', sport: 'badminton', gender: 'M' },
  { name: 'Kento Momota', username: 'momota', sport: 'badminton', gender: 'M' },
  { name: 'Kunlavut Vitidsarn', username: 'vitidsarn', sport: 'badminton', gender: 'M' },
  { name: 'Anders Antonsen', username: 'antonsen', sport: 'badminton', gender: 'M' },
  { name: 'An Se-young', username: 'anseyoung', sport: 'badminton', gender: 'W' },
  { name: 'Tai Tzu-ying', username: 'taitzuying', sport: 'badminton', gender: 'W' },
  { name: 'Carolina Marin', username: 'marin', sport: 'badminton', gender: 'W' },
];

export function seedSampleUsers({ force = false } = {}) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM user').get().n;
  if (count > 0 && !force) return { seeded: 0, existing: 0, skipped: true };
  let seeded = 0;
  let existing = 0;
  let photoed = 0;
  for (const u of SAMPLE_USERS) {
    const email = `bot.${u.username}@sample.sportscore`;
    const avatar = avatarFor(u);
    const ex = getUserByEmail(email);
    if (ex) {
      existing++;
      if (ex.avatar !== avatar) {
        setUserAvatar(ex.id, avatar);
        photoed++;
      }
      continue;
    }
    const created = createUser({
      name: u.name,
      email,
      passwordHash: hashPassword(BOT_PASSWORD),
      emailVerified: 1,
      username: u.username,
    });
    setUserAvatar(created.id, avatar);
    seeded++;
  }
  return { seeded, existing, photoed, skipped: count > 0 && !!force };
}

// Running `node server/seed.mjs` forces the sample players into the DB.
// `--demo` (or SEED_DEMO=1) additionally seeds real US Open tennis results,
// live club matches across every sport, tournaments and follows.
// (CLI runner is at the bottom of this file so every const is initialized.)

// ---- Real 2026 US Open tennis -------------------------------------------------
// Uses this year's actual round 1–2 results (flushing meadows, up to Sep 1).
// Women's matches are best-of-3 (engine default); men's are best-of-5 and are
// played as "best of 5" via the per-match setsToWin override. Tiebreak sets
// carry the tiebreak points, so scorelines render exactly like 7-6(5).

const US_OPEN = [
  // men (best of 5)
  { a: 'medvedev', b: 'gaston', sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }, { a: 6, b: 4 }], setsToWin: 3 },        // Medvedev d. Gaston
  { a: 'navone', b: 'djokovic', sets: [{ a: 7, b: 6, tb: true, tbPts: [7, 5] }, { a: 5, b: 7 }, { a: 4, b: 6 }, { a: 6, b: 2 }, { a: 6, b: 1 }], setsToWin: 3 }, // Navone d. Djokovic
  { a: 'lehecka', b: 'carrenobusta', sets: [{ a: 6, b: 1 }, { a: 7, b: 6, tb: true, tbPts: [7, 5] }, { a: 4, b: 6 }, { a: 6, b: 2 }], setsToWin: 3 },
  { a: 'paul', b: 'wong', sets: [{ a: 6, b: 7, tb: true, tbPts: [3, 7] }, { a: 6, b: 1 }, { a: 6, b: 3 }, { a: 6, b: 3 }], setsToWin: 3 },
  { a: 'bublik', b: 'jjwolf', sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }, { a: 3, b: 6 }, { a: 6, b: 1 }], setsToWin: 3 },
  { a: 'alcaraz', b: 'safiullin', sets: [{ a: 6, b: 4 }, { a: 6, b: 4 }, { a: 6, b: 4 }], setsToWin: 3 },      // defending champ opens
  { a: 'tiafoe', b: 'damm', sets: [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 3, b: 6 }, { a: 6, b: 3 }, { a: 6, b: 4 }], setsToWin: 3 }, // five-set classic
  // women (best of 3)
  { a: 'sabalenka', b: 'osorio', sets: [{ a: 6, b: 4 }, { a: 6, b: 4 }] },   // defending champ
  { a: 'swiatek', b: 'wangxiyu', sets: [{ a: 6, b: 2 }, { a: 6, b: 3 }] },
  { a: 'pegula', b: 'ruse', sets: [{ a: 6, b: 3 }, { a: 6, b: 2 }] },
  { a: 'kenin', b: 'venusw', sets: [{ a: 6, b: 2 }, { a: 7, b: 6, tb: true, tbPts: [8, 6] }] },
  { a: 'svitolina', b: 'sierra', sets: [{ a: 6, b: 1 }, { a: 6, b: 2 }] },
];

// Build a finished tennis state that faithfully replays an exact scoreline.
function tennisState(aName, bName, sets, setsToWin) {
  let s = initialState('tennis', [aName, bName], { setsToWin });
  s.started = true;
  s.completedSets = sets;
  s.setWins = [
    sets.filter((x) => x.a > x.b).length,
    sets.filter((x) => x.b > x.a).length,
  ];
  s.matchOver = true;
  s.winnerIdx = s.setWins[0] >= (setsToWin || 2) ? 0 : 1;
  s.currentSetGames = [0, 0];
  s.gamePoints = [0, 0];
  s.tiebreak = false;
  s.finishedAt = new Date().toISOString();
  return stripHistory(s);
}

export function seedUsOpenTennis() {
  const users = SAMPLE_USERS.map((u) => getUserByUsername(u.username)).filter(Boolean);
  const uid = (username) => users.find((u) => u.username === username)?.id;
  const byName = (username) => users.find((u) => u.username === username);

  // Drop the old dummy tennis demo matches so the feed shows only real US Open
  // fixtures (they were the retired-player warm-ups, not this year's event).
  for (const id of ['demo_alcaraz_federer', 'demo_swiatek_serenaw', 'demo_arianas_josemaria']) {
    if (db.prepare('SELECT 1 FROM match WHERE id = ?').get(id)) {
      db.prepare('DELETE FROM match WHERE id = ?').run(id);
    }
  }

  let seeded = 0;
  for (const g of US_OPEN) {
    const aid = uid(g.a), bid = uid(g.b);
    const a = byName(g.a), b = byName(g.b);
    if (!aid || !bid || !a || !b) continue;
    const setsToWin = g.setsToWin || 2;
    const id = `usopen_${g.a}_${g.b}`;
    if (db.prepare('SELECT 1 FROM match WHERE id = ?').get(id)) {
      seeded++;
      continue;
    }
    const state = tennisState(a.name, b.name, g.sets, setsToWin);
    createMatch({ id, sport: 'tennis', state, createdBy: aid });
    addMatchPlayer(id, aid, 0, 0);
    addMatchPlayer(id, bid, 1, 0);
    addScorer(id, aid);
    addEvent(id, 'Tennis match created · US Open 2026', aid);
    addEvent(id, 'Match started', aid);
    addEvent(id, 'Match finished', aid);
    saveMatchState(id, state, { finish: true });
    seeded++;
  }

  // One live US Open first-round match: Zverev (1) vs Sonego, on today's card.
  const liveId = 'usopen_live_zverev_sonego';
  const aid = uid('zverev'), bid = uid('sonego');
  const a = byName('zverev'), b = byName('sonego');
  if (aid && bid && a && b && !db.prepare('SELECT 1 FROM match WHERE id = ?').get(liveId)) {
    let s = initialState('tennis', [a.name, b.name], { setsToWin: 3 });
    for (let i = 0; i < 6; i++) s = apply(s, { type: 'point', player: i % 2 });
    const state = stripHistory(s);
    createMatch({ id: liveId, sport: 'tennis', state, createdBy: aid });
    addMatchPlayer(liveId, aid, 0, 0);
    addMatchPlayer(liveId, bid, 1, 0);
    addScorer(liveId, aid);
    addEvent(liveId, 'Tennis match created · US Open 2026 · Arthur Ashe Stadium', aid);
    addEvent(liveId, 'Match started', aid);
    saveMatchState(liveId, state, { finish: false });
    seeded++;
  }

  return { seeded, usOpenMatches: US_OPEN.length + 1 };
}

// ---- Demo matches ------------------------------------------------------------
// Optional, deliberate: a couple of finished + live matches per sport between
// the sample players so the landing/feed/leaderboard look alive. Kept OFF on
// fresh production unless SEED_DEMO=1 / --demo.

// Drive a match to a real finished state via the engine, then persist it.
function playMatch(sport, names, winnerIdx) {
  let s = initialState(sport, names);
  // rough determinism: winner takes the point ~70% of the time
  while (!s.matchOver) {
    const pick = Math.random() < 0.72 ? winnerIdx : 1 - winnerIdx;
    s = apply(s, { type: 'point', player: pick });
  }
  return stripHistory(s);
}

function seedOneMatch({ id, sport, a, b, winner = 0, live = false }) {
  const users = SAMPLE_USERS.map((u) => getUserByUsername(u.username)).filter(Boolean);
  const byName = (username) => users.find((u) => u.username === username);
  const aid = byName(a)?.id, bid = byName(b)?.id;
  if (!aid || !bid) return false;
  if (db.prepare('SELECT 1 FROM match WHERE id = ?').get(id)) return false;
  const names = [byName(a).name, byName(b).name];
  let state;
  if (live) {
    let s = initialState(sport, names);
    for (let i = 0; i < 10; i++) s = apply(s, { type: 'point', player: i % 2 });
    state = stripHistory(s);
    createMatch({ id, sport, state, createdBy: aid });
  } else {
    state = playMatch(sport, names, winner);
    createMatch({ id, sport, state, createdBy: aid });
  }
  addMatchPlayer(id, aid, 0, 0);
  addMatchPlayer(id, bid, 1, 0);
  addScorer(id, aid);
  addEvent(id, `${SPORTS[sport].name} match created`, aid);
  addEvent(id, 'Match started', aid);
  if (live) {
    saveMatchState(id, state, { finish: false });
  } else {
    addEvent(id, 'Match finished', aid);
    saveMatchState(id, state, { finish: true });
  }
  return true;
}

export function seedDemoMatches({ force = true } = {}) {
  void force; // additive: never wipe existing demo matches
  const finished = [
    { sport: 'padel', a: 'coello', b: 'tapia', winner: 1 },
    { sport: 'padel', a: 'dinenno', b: 'pnavarro', winner: 0 },
    { sport: 'padel', a: 'triay', b: 'josemaria', winner: 1 },
    { sport: 'pickleball', a: 'alw', b: 'parenteau', winner: 0 },
    { sport: 'pickleball', a: 'benjohns', b: 'staksrud', winner: 0 },
    { sport: 'tabletennis', a: 'malong', b: 'fanzhendong', winner: 0 },
    { sport: 'tabletennis', a: 'chenmeng', b: 'sunyingsha', winner: 1 },
    { sport: 'squash', a: 'farag', b: 'elshoragy', winner: 0 },
    { sport: 'badminton', a: 'axelsen', b: 'momota', winner: 0 },
    { sport: 'badminton', a: 'anseyoung', b: 'taitzuying', winner: 0 },
    { sport: 'racquetball', a: 'waselenchuk', b: 'carson', winner: 0 },
    { sport: 'racquetball', a: 'longoria', b: 'mjvargas', winner: 1 },
  ];
  const live = [
    { sport: 'padel', a: 'coello', b: 'dinenno' },
    { sport: 'pickleball', a: 'benjohns', b: 'alw' },
    { sport: 'tabletennis', a: 'wangchuqin', b: 'xuxin' },
    { sport: 'squash', a: 'elsherbini', b: 'elhammamy' },
    { sport: 'badminton', a: 'vitidsarn', b: 'antonsen' },
    { sport: 'racquetball', a: 'longoria', b: 'waselenchuk' },
  ];

  let seeded = 0;
  for (const g of finished) {
    const id = `demo_${g.a}_${g.b}`;
    if (seedOneMatch({ id, ...g })) seeded++;
  }
  for (const g of live) {
    const id = `demo_live_${g.a}_${g.b}`;
    if (seedOneMatch({ id, live: true, ...g })) seeded++;
  }
  return { seeded };
}

// ---- Follows ------------------------------------------------------------------
export function seedDemoFollows() {
  const users = SAMPLE_USERS.map((u) => getUserByUsername(u.username)).filter(Boolean);
  const uid = (username) => users.find((u) => u.username === username)?.id;
  let seeded = 0;
  const pairs = [
    ['coello', 'tapia'],
    ['tapia', 'coello'],
    ['dinenno', 'pnavarro'],
    ['alcaraz', 'zverev'],
    ['zverev', 'alcaraz'],
    ['djokovic', 'medvedev'],
    ['swiatek', 'sabalenka'],
    ['sabalenka', 'pegula'],
    ['gauff', 'kenin'],
    ['kenin', 'venusw'],
    ['malong', 'wangchuqin'],
    ['chenmeng', 'sunyingsha'],
    ['axelsen', 'vitidsarn'],
    ['anseyoung', 'marin'],
    ['farag', 'elshoragy'],
    ['elsherbini', 'elhammamy'],
    ['longoria', 'mjvargas'],
    ['waselenchuk', 'carson'],
  ];
  for (const [follower, followee] of pairs) {
    const f = uid(follower), e = uid(followee);
    if (!f || !e || f === e) continue;
    followUser(f, e);
    seeded++;
  }
  return { seeded };
}

// ---- Tournaments ----------------------------------------------------------------
// A finished single-elim (played through the real engine), a live group-stage
// and a draft bracket, all between sample players.

function tournamentExists(name) {
  return !!db.prepare('SELECT id FROM tournament WHERE name = ?').get(name);
}

function makeTournament({ name, sport, creator, format = 'singleElim', players }) {
  const users = SAMPLE_USERS.map((u) => getUserByUsername(u.username)).filter(Boolean);
  const uid = (username) => users.find((u) => u.username === username)?.id;
  const cid = uid(creator);
  if (!cid) return null;
  const t = createTournament({ name, sport, visibility: 'public', creatorId: cid, format });
  for (const username of players) {
    const pid = uid(username);
    if (pid) addTournamentPlayer(t.id, pid);
  }
  return t;
}

// Actually finish a tournament: open a linked match per playable fixture,
// drive each through the engine, and let onFixtureMatchFinished crown the
// eventual champion. Fixtures resolve into later rounds automatically.
function playOffTournament(t, maxGames = 30) {
  setTournamentStatus(t.id, 'live');
  let played = 0;
  let guard = 0;
  while (guard++ < 200) {
    const view = fixtureView(t.id, getFixtures(t.id));
    const playable = view.rounds
      .flatMap((r) => r.fixtures)
      .filter((f) => f.player1 && f.player2 && !f.matchId && !f.isBye && f.status === 'scheduled');
    if (!playable.length) break;
    for (const node of playable.slice(0, Math.max(1, Math.min(4, playable.length / 2)))) {
      const id = `seed_t_${t.id}_r${node.round}_p${node.position}`;
      if (db.prepare('SELECT 1 FROM match WHERE id = ?').get(id)) continue;
      const [a, b] = [node.player1, node.player2];
      const state0 = initialState(t.sport, [a.name, b.name]);
      createMatch({ id, sport: t.sport, state: stripHistory(state0), createdBy: t.creator_id });
      addMatchPlayer(id, a.id, 0, 0);
      addMatchPlayer(id, b.id, 1, 0);
      addScorer(id, t.creator_id);
      addEvent(id, `${SPORTS[t.sport].name} · ${t.name}, round ${node.round}`, t.creator_id);
      setFixtureMatch(node.id, id);
      const winnerIdx = Math.random() < 0.55 ? 0 : 1;
      const state = playMatch(t.sport, [a.name, b.name], winnerIdx);
      saveMatchState(id, state, { finish: true });
      onFixtureMatchFinished(id, winnerIdx === 0 ? a.id : b.id);
      played++;
      if (played >= maxGames) break;
    }
    if (played >= maxGames) break;
  }
  return played;
}

export function seedDemoTournaments() {
  let seeded = 0;
  const crew = ['coello', 'tapia', 'dinenno', 'pnavarro', 'lebron', 'galan', 'arianas'];

  if (!tournamentExists('Premier Padel Masters · 2026')) {
    const t = makeTournament({
      name: 'Premier Padel Masters · 2026',
      sport: 'padel',
      creator: 'coello',
      players: ['coello', 'tapia', 'dinenno', 'pnavarro', 'lebron', 'galan', 'arianas', 'josemaria'],
    });
    if (t) {
      buildBracket(t.id);
      const played = playOffTournament(t);
      const done = getTournamentById(t.id);
      if (played > 0 && done.status === 'finished') {
        seeded++;
      } else {
        // bail silently if it didn't resolve; the draft/live ones still land
        console.log(`  padel masters: played ${played}, status ${done.status}`);
      }
    }
  }

  if (!tournamentExists('Weekend Club Open · Pickleball')) {
    const t = makeTournament({
      name: 'Weekend Club Open · Pickleball',
      sport: 'pickleball',
      creator: 'benjohns',
      format: 'groupPlayoffs',
      players: ['benjohns', 'staksrud', 'alw', 'parenteau'],
    });
    if (t) {
      setTournamentStatus(t.id, 'live');
      startGroupPlayoffs(t.id); // generate the group fixtures, left mid-pool
      seeded++;
    }
  }

  if (!tournamentExists('Table Tennis Circuit · Dream Draw')) {
    const t = makeTournament({
      name: 'Table Tennis Circuit · Dream Draw',
      sport: 'tabletennis',
      creator: 'malong',
      players: ['malong', 'fanzhendong', 'wangchuqin', 'xuxin'],
    });
    if (t) {
      buildBracket(t.id); // draft bracket, not yet live
      seeded++;
    }
  }

  return { seeded };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Seeding sample players…');
  const res = seedSampleUsers({ force: true });
  console.log(res);
  if (process.argv.includes('--demo') || process.env.SEED_DEMO === '1') {
    console.log('Seeding US Open tennis…');
    console.log(seedUsOpenTennis());
    console.log('Seeding demo matches…');
    console.log(seedDemoMatches(res.seeded > 0 || res.skipped));
    console.log('Seeding follows…');
    console.log(seedDemoFollows());
    console.log('Seeding tournaments…');
    console.log(seedDemoTournaments());
  }
}
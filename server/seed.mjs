// Sample player accounts so fresh deployments aren't empty.
// Two men + two women per sport, named after real top players of that sport.

import { pathToFileURL } from 'node:url';
import { hashPassword } from './auth.mjs';
import { createUser, getUserByEmail, setUserAvatar, db } from './db.mjs';
import { createMatch, addMatchPlayer, addScorer, addEvent, saveMatchState, getUserByUsername } from './db.mjs';
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
  // tennis
  { name: 'Carlos Alcaraz', username: 'alcaraz', sport: 'tennis', gender: 'M' },
  { name: 'Roger Federer', username: 'federer', sport: 'tennis', gender: 'M' },
  { name: 'Iga Swiatek', username: 'swiatek', sport: 'tennis', gender: 'W' },
  { name: 'Serena Williams', username: 'serenaw', sport: 'tennis', gender: 'W' },
  // padel
  { name: 'Arturo Coello', username: 'coello', sport: 'padel', gender: 'M' },
  { name: 'Agustin Tapia', username: 'tapia', sport: 'padel', gender: 'M' },
  { name: 'Ariana Sanchez', username: 'arianas', sport: 'padel', gender: 'W' },
  { name: 'Paula Josemaria', username: 'josemaria', sport: 'padel', gender: 'W' },
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
  { name: 'Chen Meng', username: 'chenmeng', sport: 'tabletennis', gender: 'W' },
  { name: 'Sun Yingsha', username: 'sunyingsha', sport: 'tabletennis', gender: 'W' },
  // badminton
  { name: 'Viktor Axelsen', username: 'axelsen', sport: 'badminton', gender: 'M' },
  { name: 'Kento Momota', username: 'momota', sport: 'badminton', gender: 'M' },
  { name: 'An Se-young', username: 'anseyoung', sport: 'badminton', gender: 'W' },
  { name: 'Tai Tzu-ying', username: 'taitzuying', sport: 'badminton', gender: 'W' },
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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Seeding sample players…');
  const res = seedSampleUsers({ force: true });
  console.log(res);
  if (process.argv.includes('--demo')) {
    console.log('Seeding demo matches…');
    const demo = seedDemoMatches(res.seeded > 0 || res.skipped);
    console.log(demo);
  }
}

// ---- Demo matches ------------------------------------------------------------
// Optional, deliberate: `--demo` (or SEED_DEMO=1) adds a few finished + one live
// match between the sample players so the landing/feed/leaderboard look alive on
// a fresh deploy. Kept OFF by default so production stays clean unless requested.

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

export function seedDemoMatches({ force = true } = {}) {
  const users = SAMPLE_USERS.map((u) => getUserByUsername(u.username)).filter(Boolean);
  if (users.length < 4) return { seeded: 0, skipped: true, note: 'sample users missing' };
  const byName = (username) => users.find((u) => u.username === username);
  const uid = (username) => byName(username)?.id;

  const DEMO = [
    // finished matches
    { sport: 'tennis', a: 'alcaraz', b: 'federer', winner: 0 },
    { sport: 'tennis', a: 'swiatek', b: 'serenaw', winner: 0 },
    { sport: 'padel', a: 'coello', b: 'tapia', winner: 1 },
    { sport: 'pickleball', a: 'alw', b: 'parenteau', winner: 0 },
    { sport: 'tabletennis', a: 'malong', b: 'fanzhendong', winner: 0 },
    { sport: 'squash', a: 'farag', b: 'elshoragy', winner: 0 },
    { sport: 'badminton', a: 'axelsen', b: 'momota', winner: 0 },
    { sport: 'racquetball', a: 'waselenchuk', b: 'carson', winner: 0 },
    // one live, in-progress tennis match
    { sport: 'tennis', a: 'arianas', b: 'josemaria', live: true, winner: 0 },
  ];

  let seeded = 0;
  for (const g of DEMO) {
    const aid = uid(g.a), bid = uid(g.b);
    if (!aid || !bid) continue;
    const id = `demo_${g.a}_${g.b}`;
    if (db.prepare('SELECT 1 FROM match WHERE id = ?').get(id)) continue;
    const names = [byName(g.a).name, byName(g.b).name];
    let state;
    if (g.live) {
      let s = initialState(g.sport, names);
      for (let i = 0; i < 14; i++) s = apply(s, { type: 'point', player: i % 2 });
      state = stripHistory(s);
      // persist as a live, in-progress match
      createMatch({ id, sport: g.sport, state, createdBy: aid });
    } else {
      state = playMatch(g.sport, names, g.winner);
      createMatch({ id, sport: g.sport, state, createdBy: aid });
    }
    addMatchPlayer(id, aid, 0, 0);
    addMatchPlayer(id, bid, 1, 0);
    addScorer(id, aid);
    if (g.live) {
      addEvent(id, `${SPORTS[g.sport].name} match created`, aid);
      addEvent(id, 'Match started', aid);
      saveMatchState(id, state, { finish: false });
    } else {
      addEvent(id, `${SPORTS[g.sport].name} match created`, aid);
      addEvent(id, 'Match started', aid);
      addEvent(id, 'Match finished', aid);
      saveMatchState(id, state, { finish: true });
    }
    seeded++;
  }
  return { seeded };
}
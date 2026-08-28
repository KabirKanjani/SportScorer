// Sample player accounts so fresh deployments aren't empty.
// Two men + two women per sport, named after real top players of that sport.

import { pathToFileURL } from 'node:url';
import { hashPassword } from './auth.mjs';
import { createUser, getUserByEmail, db } from './db.mjs';

const BOT_PASSWORD = 'sample123';

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
  for (const u of SAMPLE_USERS) {
    const email = `bot.${u.username}@sample.sportscore`;
    if (getUserByEmail(email)) {
      existing++;
      continue;
    }
    createUser({
      name: u.name,
      email,
      passwordHash: hashPassword(BOT_PASSWORD),
      emailVerified: 1,
      username: u.username,
    });
    seeded++;
  }
  return { seeded, existing, skipped: count > 0 && !!force };
}

// Running `node server/seed.mjs` forces the sample players into the DB.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Seeding sample players…');
  const res = seedSampleUsers({ force: true });
  console.log(res);
}
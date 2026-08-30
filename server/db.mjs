// SQLite data layer for SportScore.
// Stores users, sessions, matches (full engine state as JSON), match players,
// event log and follows. Everything is DB-driven so the app survives restarts.

import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const DB_PATH = process.env.DATABASE_PATH || join(DATA_DIR, 'sportscore.db');

import { mkdirSync } from 'node:fs';
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL DEFAULT '',
    email_verified INTEGER NOT NULL DEFAULT 0,
    username       TEXT,
    avatar         TEXT,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS match (
    id               TEXT PRIMARY KEY,
    sport            TEXT NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('live','finished')),
    state            TEXT NOT NULL,
    created_by       INTEGER NOT NULL REFERENCES user(id),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    finished_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS match_player (
    match_id     TEXT NOT NULL REFERENCES match(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES user(id),
    side         INTEGER NOT NULL,
    pos          INTEGER NOT NULL,
    PRIMARY KEY (match_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS match_scorer (
    match_id TEXT NOT NULL REFERENCES match(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES user(id),
    PRIMARY KEY (match_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS event (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id   TEXT NOT NULL REFERENCES match(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    detail     TEXT NOT NULL,
    actor_id   INTEGER REFERENCES user(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS follow (
    follower_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    followee_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    PRIMARY KEY (follower_id, followee_id)
  );

  CREATE TABLE IF NOT EXISTS email_code (
    email      TEXT NOT NULL,
    purpose    TEXT NOT NULL CHECK (purpose IN ('verify','login','reset')),
    code_hash  TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY (email, purpose)
  );

  CREATE TABLE IF NOT EXISTS oauth_account (
    user_id       INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,
    provider_sub  TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (provider, provider_sub)
  );

  CREATE TABLE IF NOT EXISTS tournament (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    sport          TEXT NOT NULL,
    visibility     TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
    status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','finished')),
    creator_id     INTEGER NOT NULL REFERENCES user(id),
    winner_user_id INTEGER REFERENCES user(id),
    created_at     TEXT NOT NULL,
    started_at     TEXT,
    finished_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS tournament_player (
    tournament_id INTEGER NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    seed          INTEGER,
    entered_at    TEXT NOT NULL,
    PRIMARY KEY (tournament_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS fixture (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
    round         INTEGER NOT NULL,
    position      INTEGER NOT NULL,
    player1_id    INTEGER REFERENCES user(id),
    player2_id    INTEGER REFERENCES user(id),
    winner_id     INTEGER REFERENCES user(id),
    match_id      TEXT,
    status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','done')),
    created_at    TEXT NOT NULL,
    UNIQUE (tournament_id, round, position)
  );

  CREATE INDEX IF NOT EXISTS idx_match_status ON match(status);
  CREATE INDEX IF NOT EXISTS idx_match_sport ON match(sport);
  CREATE INDEX IF NOT EXISTS idx_match_updated ON match(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mp_user ON match_player(user_id);
  CREATE INDEX IF NOT EXISTS idx_ev_match ON event(match_id);
  CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id);
  CREATE INDEX IF NOT EXISTS idx_fx_tournament ON fixture(tournament_id);

  -- One-time password-reset grants: token hash -> user, short lived.
  CREATE TABLE IF NOT EXISTS reset_token (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  -- In-app notifications (bell).
  CREATE TABLE IF NOT EXISTS notification (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    type       TEXT NOT NULL DEFAULT 'general',
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    link       TEXT,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notification(user_id, read, id DESC);
`);

// Databases created before 'reset' OTPs existed had a CHECK on email_code.purpose
// that rejected them; SQLite can't alter a CHECK, so rebuild the table.
{
  const codeSql = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'email_code'`)
    .get();
  if (codeSql && !codeSql.sql.includes("'reset'")) {
    db.exec(`DROP TABLE email_code`);
    db.exec(`CREATE TABLE email_code (
      email      TEXT NOT NULL,
      purpose    TEXT NOT NULL CHECK (purpose IN ('verify','login','reset')),
      code_hash  TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (email, purpose)
    );`);
  }
}

// Migration for databases created before email verification existed.
{
  const cols = db.prepare('PRAGMA table_info(user)').all();
  if (!cols.some((c) => c.name === 'email_verified')) {
    db.exec(
      'ALTER TABLE user ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0'
    );
  }
  if (!cols.some((c) => c.name === 'password_hash')) {
    db.exec('ALTER TABLE user ADD COLUMN password_hash TEXT NOT NULL DEFAULT \'\'');
  }
  if (!cols.some((c) => c.name === 'username')) {
    db.exec('ALTER TABLE user ADD COLUMN username TEXT');
  }
  if (!cols.some((c) => c.name === 'avatar')) {
    db.exec('ALTER TABLE user ADD COLUMN avatar TEXT');
  }
  // A unique index matters more than a column constraint here: real platforms
  // migrate pre-existing tables, and SQLite forbids ADD COLUMN ... UNIQUE.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON user(username)');
}

// Pre-match data (toss, venue, court, conditions, "started" gate). Matches
// created before this column existed have no gate (NULL -> treated as started).
{
  const mcols = db.prepare('PRAGMA table_info(match)').all();
  if (!mcols.some((c) => c.name === 'pre_match')) {
    db.exec('ALTER TABLE match ADD COLUMN pre_match TEXT');
  }
}

// Migrations (forward-compat for databases created by older versions).
{
  const ecols = db.prepare('PRAGMA table_info(event)').all();
  if (!ecols.some((c) => c.name === 'actor_id')) {
    db.exec('ALTER TABLE event ADD COLUMN actor_id INTEGER REFERENCES user(id)');
  }
  // Structured point-detail stats (match report): kind = normalized outcome
  // (ace/doublefault/winner/...), player_idx = which side the detail belongs to.
  if (!ecols.some((c) => c.name === 'kind')) {
    db.exec('ALTER TABLE event ADD COLUMN kind TEXT');
  }
  if (!ecols.some((c) => c.name === 'player_idx')) {
    db.exec('ALTER TABLE event ADD COLUMN player_idx INTEGER');
  }
}

// ---------------- Users ------------------------------------------------------

function slugify(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
}

// Returns a unique lowercase username based on the given name/email.
export function uniqueUsername(base) {
  let stem = slugify(base) || 'player';
  if (stem.length < 3) stem = `${stem}player`.slice(0, 6);
  let want = stem;
  let i = 0;
  for (;;) {
    const row = db
      .prepare(`SELECT 1 FROM user WHERE lower(username) = lower(?)`)
      .get(want);
    if (!row) return want;
    i += 1;
    want = `${stem}${i}`.slice(0, 20);
  }
}

// Prefix/strip a leading "@" if present.
export function cleanUsername(v) {
  return String(v || '').replace(/^@+/, '').trim().toLowerCase();
}

export function createUser({
  name,
  email,
  passwordHash,
  emailVerified = 0,
  username,
}) {
  const now = new Date().toISOString();
  const uname = cleanUsername(username) || uniqueUsername(name || email);
  const info = db
    .prepare(
      `INSERT INTO user (name, email, password_hash, email_verified, username, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      email,
      passwordHash || '',
      emailVerified ? 1 : 0,
      uname,
      now
    );
  return getUserById(info.lastInsertRowid);
}

export function markEmailVerified(userId) {
  db.prepare(`UPDATE user SET email_verified = 1 WHERE id = ?`).run(userId);
}

export function setUserPassword(userId, passwordHash) {
  db.prepare(`UPDATE user SET password_hash = ? WHERE id = ?`).run(
    passwordHash,
    userId
  );
}

export function saveResetToken(tokenHash, userId, expiresAt) {
  db.prepare(
    `INSERT OR REPLACE INTO reset_token (token_hash, user_id, expires_at) VALUES (?, ?, ?)`
  ).run(tokenHash, userId, expiresAt);
}

export function getResetToken(tokenHash) {
  return db
    .prepare(`SELECT user_id AS userId, expires_at AS expiresAt FROM reset_token WHERE token_hash = ?`)
    .get(tokenHash);
}

export function deleteResetToken(tokenHash) {
  db.prepare(`DELETE FROM reset_token WHERE token_hash = ?`).run(tokenHash);
}

export function clearExpiredResetTokens() {
  db.prepare(`DELETE FROM reset_token WHERE expires_at < ?`).run(Date.now());
}

// Provider login: reuse an existing account by email (link) or create a new one.
export function findOrCreateOAuthUser({ provider, sub, email, name }) {
  const link = db
    .prepare(
      `SELECT user_id FROM oauth_account WHERE provider = ? AND provider_sub = ?`
    )
    .get(provider, sub);
  if (link) {
    const u = getUserById(link.user_id);
    return u ? { user: u, linked: true } : { user: null, linked: true };
  }
  const existing = getUserByEmail(email);
  if (existing) {
    db.prepare(
      `INSERT OR IGNORE INTO oauth_account (user_id, provider, provider_sub, created_at)
       VALUES (?, ?, ?, ?)`
    ).run(existing.id, provider, sub, new Date().toISOString());
    markEmailVerified(existing.id);
    return { user: existing, linked: true };
  }
  const u = createUser({ name, email, passwordHash: null, emailVerified: 1 });
  db.prepare(
    `INSERT INTO oauth_account (user_id, provider, provider_sub, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(u.id, provider, sub, new Date().toISOString());
  return { user: u, linked: false };
}

export function getUserByEmail(email) {
  return db
    .prepare(`SELECT * FROM user WHERE lower(email) = lower(?)`)
    .get(email);
}

export function getUserByUsername(username) {
  return db
    .prepare(`SELECT * FROM user WHERE lower(username) = lower(?)`)
    .get(cleanUsername(username));
}

export function getUserById(id) {
  return db.prepare(`SELECT * FROM user WHERE id = ?`).get(id);
}

// Ids + last-modified dates for the SEO sitemap. Capped so the XML stays small
// on every scale; sitemaps above ~10k URLs aren't crawled faster anyway.
export function listSitemapEntries() {
  const users = db
    .prepare(`SELECT id, created_at AS lastmod FROM user ORDER BY id ASC LIMIT 5000`)
    .all();
  const matches = db
    .prepare(`SELECT id, updated_at AS lastmod FROM match ORDER BY id ASC LIMIT 5000`)
    .all();
  const tournaments = db
    .prepare(`SELECT id, created_at AS lastmod FROM tournament WHERE visibility = 'public' ORDER BY id ASC LIMIT 5000`)
    .all();
  return { users, matches, tournaments };
}

// Global per-sport leaderboard computed from finished matches. A match counts
// for every player on the winning/losing side, so doubles awards both partners.
// Streaks are ordinal: positive = wins in a row, negative = losses in a row.
export function leaderboard({ sport = null, limit = 100 } = {}) {
  const finished = db
    .prepare(`SELECT id, sport, state FROM match WHERE status = 'finished' ORDER BY finished_at ASC`)
    .all();
  if (finished.length === 0) return [];

  const byMatch = new Map();
  for (const p of db.prepare(`SELECT match_id, user_id, side FROM match_player`).all()) {
    const arr = byMatch.get(p.match_id) || [];
    arr.push(p);
    byMatch.set(p.match_id, arr);
  }
  const users = new Map(
    db.prepare(`SELECT id, name, username, avatar FROM user`).all().map((u) => [u.id, u])
  );

  const stat = new Map(); // user -> { global, bySport }
  const slot = (us, key) => {
    if (key === 'global' && !us.global) us.global = { played: 0, wins: 0, losses: 0, seq: [] };
    if (key !== 'global' && !us.bySport.has(key)) {
      us.bySport.set(key, { played: 0, wins: 0, losses: 0, seq: [] });
    }
    return key === 'global' ? us.global : us.bySport.get(key);
  };

  for (const m of finished) {
    let state;
    try {
      state = typeof m.state === 'string' ? JSON.parse(m.state) : m.state;
    } catch {
      continue;
    }
    if (!state || !state.matchOver || state.winnerIdx == null) continue;
    const wi = state.winnerIdx;
    for (const p of byMatch.get(m.id) || []) {
      const won = p.side === wi ? 1 : 0;
      let us = stat.get(p.user_id);
      if (!us) {
        us = { global: null, bySport: new Map() };
        stat.set(p.user_id, us);
      }
      for (const key of ['global', m.sport]) {
        const s = slot(us, key);
        s.played += 1;
        if (won) s.wins += 1;
        else s.losses += 1;
        s.seq.push(won);
      }
    }
  }

  const streakOf = (s) => {
    let curW = 0;
    let curL = 0;
    let best = 0;
    for (const won of s.seq) {
      if (won) {
        curW += 1;
        curL = 0;
        if (curW > best) best = curW;
      } else {
        curL += 1;
        curW = 0;
        if (curL > best) best = curL;
      }
    }
    const cur = curW > curL ? curW : -curL;
    return { streak: cur, best };
  };

  const rows = [];
  for (const [uid, us] of stat) {
    const s = sport ? us.bySport.get(sport) : us.global;
    if (!s || s.played === 0) continue;
    const u = users.get(uid);
    if (!u) continue;
    const { streak, best } = streakOf(s);
    rows.push({
      user: { id: uid, name: u.name, username: u.username, avatar: u.avatar },
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      winPct: Math.round((100 * s.wins) / s.played),
      streak,
      best,
    });
  }

  rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.winPct - a.winPct ||
      a.losses - b.losses ||
      a.user.name.localeCompare(b.user.name)
  );

  return rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}

export function searchUsers(q, limit = 8) {
  if (!q) {
    return db
      .prepare(`SELECT id, name, username, avatar, email FROM user ORDER BY name LIMIT ?`)
      .all(limit);
  }
  const like = `%${q}%`;
  return db
    .prepare(
      `SELECT id, name, username, avatar, email FROM user
       WHERE name LIKE ? OR username LIKE ?
       ORDER BY name LIMIT ?`
    )
    .all(like, like, limit);
}

// Tolerant lookup for player references: exact username, then exact name, then
// a partial (name/username) match. Returns the full user plus how many records
// matched, so callers can tell an "ambiguous" miss from a plain miss.
export function resolveUserEntry(raw, limit = 8) {
  const s = String(raw || '').trim().replace(/^@+/, '');
  const out = { user: null, matches: 0 };
  if (!s) return out;
  const byUsername = getUserByUsername(s);
  if (byUsername) return { user: byUsername, matches: 1 };
  const byName = db
    .prepare(`SELECT id FROM user WHERE lower(name) = lower(?)`)
    .all(s);
  if (byName.length === 1) return { user: getUserById(byName[0].id), matches: 1 };
  const hits = searchUsers(s, limit);
  if (hits.length === 1) return { user: getUserById(hits[0].id), matches: 1 };
  return { user: null, matches: hits.length };
}

export function serializeUser(u) {
  return u
    ? {
        id: u.id,
        name: u.name,
        username: u.username || null,
        avatar: u.avatar || null,
        email: u.email,
        emailVerified: !!u.email_verified,
        createdAt: u.created_at,
      }
    : null;
}

export function setUserAvatar(userId, file) {
  db.prepare('UPDATE user SET avatar = ? WHERE id = ?').run(file, userId);
}

export function clearUserAvatar(userId) {
  db.prepare('UPDATE user SET avatar = NULL WHERE id = ?').run(userId);
}

// ---------------- Sessions ---------------------------------------------------

export function createSession(userId) {
  const token = randomUUID() + randomUUID();
  const now = new Date().toISOString();
  const expires = Date.now() + 30 * 24 * 3600 * 1000; // epoch ms
  db.prepare(
    `INSERT INTO session (token, user_id, created_at, expires_at) VALUES (?,?,?,?)`
  ).run(token, userId, now, String(expires));
  return token;
}

export function deleteSession(token) {
  db.prepare(`DELETE FROM session WHERE token = ?`).run(token);
}

export function getUserBySession(token) {
  if (!token) return null;
  const sess = db
    .prepare(
      `SELECT s.user_id FROM session s
       WHERE s.token = ? AND CAST(s.expires_at AS INTEGER) > ?`
    )
    .get(token, String(Date.now()));
  if (!sess) return null;
  return getUserById(sess.user_id);
}

// ---------------- Email codes (OTP) -------------------------------------------------

export function saveEmailCode({ email, purpose, codeHash, expiresAt }) {
  db.prepare(`DELETE FROM email_code WHERE email = ? AND purpose = ?`).run(
    email,
    purpose
  );
  db.prepare(
    `INSERT INTO email_code (email, purpose, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(email, purpose, codeHash, String(expiresAt), new Date().toISOString());
}

export function getEmailCode(email, purpose) {
  return db
    .prepare(`SELECT * FROM email_code WHERE email = ? AND purpose = ?`)
    .get(email, purpose);
}

export function deleteEmailCode(email, purpose) {
  db.prepare(`DELETE FROM email_code WHERE email = ? AND purpose = ?`).run(
    email,
    purpose
  );
}

export function bumpCodeAttempts(email, purpose) {
  db.prepare(
    `UPDATE email_code SET attempts = attempts + 1 WHERE email = ? AND purpose = ?`
  ).run(email, purpose);
}

// Number of codes sent to this email in the last `minutes` (rate limiting).
export function countRecentCodes(email, minutes = 15) {
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM email_code WHERE email = ? AND created_at > ?`
    )
    .get(email, since).n;
}

// ---------------- Matches ----------------------------------------------------

export function createMatch({ id, sport, state, createdBy, preMatch = null }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO match (id, sport, status, state, pre_match, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    id,
    sport,
    'live',
    JSON.stringify(state),
    preMatch ? JSON.stringify(preMatch) : null,
    createdBy,
    now,
    now
  );
  return id;
}

export function saveMatchState(id, state, { finish } = {}) {
  const now = new Date().toISOString();
  const status = finish ? 'finished' : 'live';
  if (finish) {
    db.prepare(
      `UPDATE match SET state=?, status=?, updated_at=?, finished_at=? WHERE id=?`
    ).run(JSON.stringify(state), status, now, now, id);
  } else {
    db.prepare(`UPDATE match SET state=?, status=?, updated_at=? WHERE id=?`).run(
      JSON.stringify(state),
      status,
      now,
      id
    );
  }
}

export function getMatch(id) {
  const m = db.prepare(`SELECT * FROM match WHERE id = ?`).get(id);
  if (!m) return null;
  return hydrateMatch(m);
}

function hydrateMatch(m) {
  const players = db
    .prepare(
      `SELECT mp.user_id, mp.side, mp.pos, u.name, u.email, u.avatar
       FROM match_player mp JOIN user u ON u.id = mp.user_id
       WHERE mp.match_id = ? ORDER BY mp.side, mp.pos`
    )
    .all(m.id)
    .map((p) => ({
      userId: p.user_id,
      side: p.side,
      pos: p.pos,
      name: p.name,
      email: p.email,
      avatar: p.avatar,
    }));
  const scorers = db
    .prepare(
      `SELECT ms.user_id, u.name FROM match_scorer ms JOIN user u ON u.id = ms.user_id
       WHERE ms.match_id = ? ORDER BY u.name`
    )
    .all(m.id)
    .map((s) => ({ userId: s.user_id, name: s.name }));
  return {
    id: m.id,
    sport: m.sport,
    status: m.status,
    state: JSON.parse(m.state),
    createdBy: m.created_by,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    finishedAt: m.finished_at,
    preMatch: m.pre_match ? JSON.parse(m.pre_match) : null,
    players,
    scorers,
  };
}

// Latest matches for the public feed (live first, then finished).
export function listMatches({ sport, status, limit = 20, offset = 0 }) {
  const qs = [];
  const params = [];
  if (sport) {
    qs.push('sport = ?');
    params.push(sport);
  }
  if (status) {
    qs.push('status = ?');
    params.push(status);
  }
  const where = qs.length ? `WHERE ${qs.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT * FROM match ${where}
       ORDER BY status='live' DESC, updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  return rows.map(hydrateMatch);
}

// Matches involving a specific user.
export function listMatchesByUser(userId, { limit = 50 } = {}) {
  const rows = db
    .prepare(
      `SELECT m.* FROM match m
       JOIN match_player mp ON mp.match_id = m.id
       WHERE mp.user_id = ?
       ORDER BY m.updated_at DESC LIMIT ?`
    )
    .all(userId, limit);
  return rows.map(hydrateMatch);
}

// Matches of players a user follows.
export function listMatchesByFollowed(followerId, { limit = 20 } = {}) {
  const rows = db
    .prepare(
      `SELECT m.* FROM match m
       JOIN match_player mp ON mp.match_id = m.id
       JOIN follow f ON f.followee_id = mp.user_id AND f.follower_id = ?
       WHERE m.status = 'live'
       GROUP BY m.id ORDER BY m.updated_at DESC LIMIT ?`
    )
    .all(followerId, limit);
  return rows.map(hydrateMatch);
}

// ---------------- Match players ----------------------------------------------

export function addMatchPlayer(matchId, userId, side, pos) {
  db.prepare(
    `INSERT OR IGNORE INTO match_player (match_id, user_id, side, pos)
     VALUES (?,?,?,?)`
  ).run(matchId, userId, side, pos);
}

export function isPlayerOf(matchId, userId) {
  return !!db
    .prepare(`SELECT 1 FROM match_player WHERE match_id = ? AND user_id = ?`)
    .get(matchId, userId);
}

export function isCreatorOf(matchId, userId) {
  return !!db
    .prepare(`SELECT 1 FROM match WHERE id = ? AND created_by = ?`)
    .get(matchId, userId);
}

export function canScore(matchId, userId) {
  if (!userId) return false;
  return isCreatorOf(matchId, userId) || isPlayerOf(matchId, userId) || isScorerOf(matchId, userId);
}

// ---------------- Scorers ----------------------------------------------------

export function addScorer(matchId, userId) {
  db.prepare(`INSERT OR IGNORE INTO match_scorer (match_id, user_id) VALUES (?,?)`).run(
    matchId,
    userId
  );
}

export function isScorerOf(matchId, userId) {
  return !!db
    .prepare(`SELECT 1 FROM match_scorer WHERE match_id = ? AND user_id = ?`)
    .get(matchId, userId);
}

// Pre-match "started" gate. Matches predating the column default to started
// so existing behaviour is preserved. Started is stored inside pre_match.
export function matchStarted(matchId) {
  const m = db.prepare(`SELECT pre_match FROM match WHERE id = ?`).get(matchId);
  if (!m || !m.pre_match) return true;
  const p = JSON.parse(m.pre_match);
  return p.started === true;
}

export function setMatchStarted(matchId) {
  const m = db.prepare(`SELECT pre_match FROM match WHERE id = ?`).get(matchId);
  const p = m && m.pre_match ? JSON.parse(m.pre_match) : {};
  p.started = true;
  db.prepare(`UPDATE match SET pre_match = ? WHERE id = ?`).run(JSON.stringify(p), matchId);
}

// Merge a partial update into pre_match (toss result, details, preferences).
export function setPreMatch(matchId, patch) {
  const m = db.prepare(`SELECT pre_match FROM match WHERE id = ?`).get(matchId);
  const cur = m && m.pre_match ? JSON.parse(m.pre_match) : { started: false };
  const next = { ...cur, ...patch };
  db.prepare(`UPDATE match SET pre_match = ? WHERE id = ?`).run(JSON.stringify(next), matchId);
  return next;
}

// ---------------- Events -----------------------------------------------------

export function addEvent(matchId, detail, actorId = null, opts = {}) {
  const { kind = null, playerIdx = null } = opts || {};
  const seq =
    db.prepare(`SELECT COALESCE(MAX(seq),0)+1 AS n FROM event WHERE match_id=?`).get(matchId).n;
  db.prepare(
    `INSERT INTO event (match_id, seq, detail, actor_id, kind, player_idx, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    matchId,
    seq,
    detail,
    actorId ?? null,
    kind ?? null,
    playerIdx ?? null,
    new Date().toISOString()
  );
  return seq;
}

export function getEvents(matchId) {
  return db
    .prepare(
      `SELECT e.id, e.seq, e.detail, e.created_at, e.actor_id, e.kind, e.player_idx, u.name AS actor_name
       FROM event e LEFT JOIN user u ON u.id = e.actor_id
       WHERE e.match_id=? ORDER BY e.seq`
    )
    .all(matchId)
    .map((e) => ({
      id: e.id,
      seq: e.seq,
      detail: e.detail,
      createdAt: e.created_at,
      kind: e.kind,
      playerIdx: e.player_idx,
      actor: e.actor_id ? { id: e.actor_id, name: e.actor_name } : null,
    }));
}

// ---------------- Follow -----------------------------------------------------

export function followUser(followerId, followeeId) {
  db.prepare(`INSERT OR IGNORE INTO follow (follower_id, followee_id) VALUES (?,?)`).run(
    followerId,
    followeeId
  );
}

export function unfollowUser(followerId, followeeId) {
  db.prepare(`DELETE FROM follow WHERE follower_id=? AND followee_id=?`).run(
    followerId,
    followeeId
  );
}

export function isFollowing(followerId, followeeId) {
  return (
    followerId != null &&
    !!db
      .prepare(`SELECT 1 FROM follow WHERE follower_id=? AND followee_id=?`)
      .get(followerId, followeeId)
  );
}

export function countFollowers(userId) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM follow WHERE followee_id = ?`)
    .get(userId).n;
}

export function followingIds(userId) {
  return db
    .prepare(`SELECT followee_id FROM follow WHERE follower_id = ?`)
    .all(userId)
    .map((r) => r.followee_id);
}

export function notify(userId, { type = 'general', title, body, link = null } = {}) {
  if (userId == null) return;
  db.prepare(
    `INSERT INTO notification (user_id, type, title, body, link, read, created_at)
     VALUES (?,?,?,?,?,0,?)`
  ).run(userId, type, String(title || '').slice(0, 200), String(body || '').slice(0, 500), link, new Date().toISOString());
}

export function listNotifications(userId, { limit = 50 } = {}) {
  return db
    .prepare(`SELECT id, type, title, body, link, read, created_at
              FROM notification WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
    .all(userId, limit)
    .map((n) => ({ ...n, read: !!n.read }));
}

export function unreadNotifications(userId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM notification WHERE user_id = ? AND read = 0`).get(userId).n;
}

export function markNotificationsRead(userId) {
  db.prepare(`UPDATE notification SET read = 1 WHERE user_id = ? AND read = 0`).run(userId);
}

// ---------------- Events feed (notification-style) ---------------------------

export function recentEvents(limit = 30) {
  return db
    .prepare(`SELECT * FROM event ORDER BY id DESC LIMIT ?`)
    .all(limit);
}

// ---------------- Tournaments -------------------------------------------------

export function createTournament({ name, sport, visibility, creatorId }) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO tournament (name, sport, visibility, status, creator_id, created_at)
       VALUES (?, ?, ?, 'draft', ?, ?)`
    )
    .run(name, sport, visibility || 'public', creatorId, now);
  return getTournamentById(info.lastInsertRowid);
}

export function getTournamentById(id) {
  const t = db.prepare(`SELECT * FROM tournament WHERE id = ?`).get(id);
  if (!t) return null;
  t.creator = getUserById(t.creator_id);
  t.winner = t.winner_user_id ? getUserById(t.winner_user_id) : null;
  return t;
}

// Public tournaments plus ones the current user created / joined.
export function listTournamentsForUser(userId) {
  return db
    .prepare(
      `SELECT DISTINCT t.* FROM tournament t
       WHERE t.visibility = 'public'
          OR t.creator_id = ?
          OR EXISTS (SELECT 1 FROM tournament_player tp WHERE tp.tournament_id = t.id AND tp.user_id = ?)
       ORDER BY t.created_at DESC`
    )
    .all(userId, userId);
}

// Name search over the tournaments the viewer is allowed to see.
export function searchTournaments(q, userId, limit = 30) {
  if (!q) return listTournamentsForUser(userId);
  const like = `%${q}%`;
  return db
    .prepare(
      `SELECT DISTINCT t.* FROM tournament t
       WHERE (t.visibility = 'public'
          OR t.creator_id = ?
          OR EXISTS (SELECT 1 FROM tournament_player tp WHERE tp.tournament_id = t.id AND tp.user_id = ?))
       AND t.name LIKE ?
       ORDER BY t.created_at DESC LIMIT ?`
    )
    .all(userId, userId, like, limit);
}

export function getTournamentPlayers(tournamentId) {
  return db
    .prepare(
      `SELECT tp.user_id AS userId, tp.seed AS seed, u.name AS name, u.username AS username, u.avatar AS avatar, u.email_verified AS emailVerified
       FROM tournament_player tp JOIN user u ON u.id = tp.user_id
       WHERE tp.tournament_id = ?
       ORDER BY (tp.seed IS NULL), tp.seed ASC, tp.entered_at ASC`
    )
    .all(tournamentId);
}

export function addTournamentPlayer(tournamentId, userId) {
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO tournament_player (tournament_id, user_id, entered_at)
       VALUES (?, ?, ?)`
    )
    .run(tournamentId, userId, new Date().toISOString());
  return info.changes > 0;
}

export function removeTournamentPlayer(tournamentId, userId) {
  db.prepare(`DELETE FROM tournament_player WHERE tournament_id = ? AND user_id = ?`).run(
    tournamentId,
    userId
  );
}

export function isTournamentPlayer(tournamentId, userId) {
  return !!db
    .prepare(`SELECT 1 FROM tournament_player WHERE tournament_id = ? AND user_id = ?`)
    .get(tournamentId, userId);
}

export function isTournamentCreator(tournamentId, userId) {
  return !!db
    .prepare(`SELECT 1 FROM tournament WHERE id = ? AND creator_id = ?`)
    .get(tournamentId, userId);
}

export function setTournamentPlayerSeed(tournamentId, userId, seed) {
  db.prepare(`UPDATE tournament_player SET seed = ? WHERE tournament_id = ? AND user_id = ?`).run(
    seed,
    tournamentId,
    userId
  );
}

export function setTournamentStatus(id, status, { started = true } = {}) {
  const now = new Date().toISOString();
  if (started && status === 'live') {
    db.prepare(`UPDATE tournament SET status = ?, started_at = ? WHERE id = ?`).run(
      status,
      now,
      id
    );
  } else {
    db.prepare(`UPDATE tournament SET status = ? WHERE id = ?`).run(status, id);
  }
}

export function setTournamentWinner(id, userId, status = 'finished') {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE tournament SET status = ?, winner_user_id = ?, finished_at = ? WHERE id = ?`
  ).run(status, userId, now, id);
}

export function createFixture({ tournamentId, round, position, player1Id = null, player2Id = null }) {
  const info = db
    .prepare(
      `INSERT INTO fixture (tournament_id, round, position, player1_id, player2_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      tournamentId,
      round,
      position,
      player1Id,
      player2Id,
      new Date().toISOString()
    );
  return getFixtureById(info.lastInsertRowid);
}

export function getFixtureById(id) {
  return db.prepare(`SELECT * FROM fixture WHERE id = ?`).get(id);
}

export function getFixtures(tournamentId) {
  return db
    .prepare(`SELECT * FROM fixture WHERE tournament_id = ? ORDER BY round, position`)
    .all(tournamentId)
    .map((f) => ({
      ...f,
      player1: f.player1_id ? getUserById(f.player1_id) : null,
      player2: f.player2_id ? getUserById(f.player2_id) : null,
      winner: f.winner_id ? getUserById(f.winner_id) : null,
    }));
}

export function getFixtureByMatch(matchId) {
  return db.prepare(`SELECT * FROM fixture WHERE match_id = ?`).get(matchId);
}

export function setFixtureMatch(fixtureId, matchId) {
  db.prepare(`UPDATE fixture SET match_id = ?, status = 'live' WHERE id = ?`).run(
    matchId,
    fixtureId
  );
}

export function resolveFixtureWinner(fixtureId, userId) {
  db.prepare(`UPDATE fixture SET winner_id = ?, status = 'done' WHERE id = ?`).run(
    userId,
    fixtureId
  );
}

export function setFixturePlayers(fixtureId, player1Id, player2Id) {
  db.prepare(`UPDATE fixture SET player1_id = ?, player2_id = ? WHERE id = ?`).run(
    player1Id,
    player2Id,
    fixtureId
  );
}
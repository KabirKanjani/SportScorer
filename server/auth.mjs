// Authentication helpers: password hashing, session cookies.
import bcrypt from 'bcryptjs';
import {
  createSession,
  deleteSession,
  getUserByEmail,
  getUserByUsername,
  getUserBySession,
  createUser,
  serializeUser,
  cleanUsername,
} from './db.mjs';
import { issueOtp } from './otp.mjs';

export const SESSION_COOKIE = 'ss_sess';
const BCRYPT_ROUNDS = 10;
export const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Password --------------------------------------------------------------

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// ---- Session -----------------------------------------------------------------

function getCookieHeader(req) {
  return req.headers?.cookie || '';
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionTokenFromRequest(req) {
  return parseCookies(getCookieHeader(req))[SESSION_COOKIE] || null;
}

// Express middleware: attaches req.user if a valid session cookie exists.
export function attachUser(req, _res, next) {
  const token = sessionTokenFromRequest(req);
  const user = token ? getUserBySession(token) : null;
  req.user = user ? serializeUser(user) : null;
  req.sessionToken = token;
  next();
}

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function cookieOptions(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    // 'none' when over HTTPS so the bundled mobile app (origin https://localhost
    // / capacitor://localhost) can auth against the hosted API; 'lax' in dev.
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
  };
}

// ---- Route handlers ----------------------------------------------------------

// Starts a session and returns the serialized user.
export function startSession(req, res, user) {
  const token = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions(req));
  return serializeUser(user);
}

export async function registerRoute(req, res) {
  const { name, email, password, username } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Please enter a valid email' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const clean = String(email).trim();
  if (getUserByEmail(clean)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  if (username != null && String(username).trim()) {
    const uname = cleanUsername(username);
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
      return res.status(400).json({
        error: 'Username must be 3–20 letters, numbers or underscores (e.g. alex_07).',
      });
    }
    if (getUserByUsername(uname)) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
  }
  const user = createUser({
    name: String(name).trim(),
    email: clean,
    passwordHash: hashPassword(String(password)),
    emailVerified: 0,
    ...(username != null && String(username).trim() ? { username } : {}),
  });
  // Always start a session: registration must work even if email delivery
  // is blocked (the code comes back in-band via devCode).
  try {
    const sent = await issueOtp(clean, 'verify');
    if (sent.error) {
      return res.status(sent.code || 400).json({ error: sent.error });
    }
    return res.json({
      user: startSession(req, res, user),
      needsVerification: true,
      ...(sent.devCode ? { devCode: sent.devCode, emailBlocked: sent.emailBlocked } : {}),
    });
  } catch (e) {
    console.error('register/otp failed:', e.message);
    return res.status(502).json({ error: 'Could not register right now. Please try again.' });
  }
}

export function loginRoute(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const user = getUserByEmail(String(email));
  if (!user || !user.password_hash) {
    return res.status(401).json({
      error: user?.password_hash
        ? 'Invalid email or password'
        : 'No password on this account — sign in with Google or a login code.',
    });
  }
  if (!verifyPassword(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  return res.json({ user: startSession(req, res, user) });
}

export function logoutRoute(req, res) {
  if (req.sessionToken) deleteSession(req.sessionToken);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
}

export function meRoute(req, res) {
  res.json({ user: req.user });
}
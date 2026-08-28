// Authentication helpers: password hashing, session cookies.
import bcrypt from 'bcryptjs';
import {
  createSession,
  deleteSession,
  getUserByEmail,
  getUserByPhone,
  getUserBySession,
  createUser,
  serializeUser,
} from './db.mjs';
import { issueOtp, issuePhoneCode, normalizePhone, isPhoneOk } from './otp.mjs';

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
    sameSite: 'lax',
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
  const { name, email, phone, password } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  const cleanName = String(name).trim();
  const cleanPhone = normalizePhone(phone) || null;

  if (cleanPhone) {
    // Phone-first signup: email and password are optional extras.
    if (!isPhoneOk(cleanPhone)) {
      return res.status(400).json({
        error: 'Enter a valid phone number (e.g. +91 98765 43210 or 98765 43210).',
      });
    }
    if (getUserByPhone(cleanPhone)) {
      return res.status(409).json({ error: 'An account with that number already exists' });
    }
    let cleanEmail = String(email || '').trim();
    if (cleanEmail) {
      if (!EMAIL_RE.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email' });
      }
      if (getUserByEmail(cleanEmail)) {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
    } else {
      cleanEmail = `${cleanPhone.replace(/[^+\d]/g, '')}@phone`;
    }
    const cleanPassword = String(password || '');
    if (cleanPassword && cleanPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const user = createUser({
      name: cleanName,
      email: cleanEmail,
      passwordHash: cleanPassword ? hashPassword(cleanPassword) : null,
      emailVerified: cleanEmail.endsWith('@phone') ? 1 : 0,
      phone: cleanPhone,
      phoneVerified: 0,
    });
    try {
      const sent = await issuePhoneCode(cleanPhone, 'register');
      if (sent.error) throw new Error(sent.error);
      return res.json({
        user: startSession(req, res, user),
        needsVerification: true,
        ...(sent.devCode ? { devCode: sent.devCode } : {}),
      });
    } catch {
      return res
        .status(502)
        .json({ error: 'Account created, but the verification SMS could not be sent.' });
    }
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
  const user = createUser({
    name: cleanName,
    email: clean,
    passwordHash: hashPassword(String(password)),
    emailVerified: 0,
  });
  try {
    const sent = await issueOtp(clean, 'verify');
    if (sent.error) throw new Error(sent.error);
    return res.json({
      user: startSession(req, res, user),
      needsVerification: true,
      ...(sent.devCode ? { devCode: sent.devCode } : {}),
    });
  } catch {
    return res
      .status(502)
      .json({ error: 'Account created, but the verification email could not be sent.' });
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
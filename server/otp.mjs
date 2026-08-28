// One-time-password codes: generate, send, verify.
import { randomInt, createHash, timingSafeEqual } from 'node:crypto';
import {
  saveEmailCode,
  getEmailCode,
  deleteEmailCode,
  bumpCodeAttempts,
  countRecentCodes,
  savePhoneCode,
  getPhoneCode,
  deletePhoneCode,
  bumpPhoneAttempts,
  countRecentPhoneCodes,
  getUserByEmail,
  getUserByPhone,
  createUser,
  markEmailVerified,
} from './db.mjs';
import { sendEmail, otpEmailHtml, DEV_MODE } from './email.mjs';
import { sendSms, DEV_MODE as SMS_DEV_MODE } from './sms.mjs';

export const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 8;
const MAX_CODES_PER_15MIN = 5;

export function generateCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

function hashCode(code) {
  return createHash('sha256').update(code).digest('hex');
}

export function isOtpPurpose(v) {
  return v === 'verify' || v === 'login';
}

export function isPhonePurpose(v) {
  return v === 'register' || v === 'login' || v === 'verify_own';
}

export function normalizePhone(v) {
  return String(v || '')
    .replace(/[\s\-().]/g, '')
    .trim();
}

// Accepts E.164-style (+919876543210) and local formats (9876543210,
// 09876543210). The SMS provider is the authority on whether a specific
// number is callable, so we just sanity-check the shape here.
export function isPhoneOk(v) {
  return /^\+?\d{8,15}$/.test(normalizePhone(v));
}

export function nameFromEmail(email) {
  const part = email.split('@')[0] || 'Player';
  return part
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .slice(0, 24) || 'Player';
}

// Issues a fresh code and sends it. Rate-limited per email. In dev mode (no
// Resend key) returns devCode so the UI can show it.
export async function issueOtp(email, purpose) {
  const recent = countRecentCodes(email, 15);
  if (recent >= MAX_CODES_PER_15MIN) {
    return { error: 'Too many codes sent to this email. Try again in a few minutes.', code: 429 };
  }
  const code = generateCode();
  saveEmailCode({
    email,
    purpose,
    codeHash: hashCode(code),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
  });
  const subject =
    purpose === 'login' ? 'Your SportScore login code' : 'Verify your SportScore email';
  if (!DEV_MODE) {
    await sendEmail({ to: email, subject, html: otpEmailHtml(code, purpose) });
  }
  return { ok: true, ...(DEV_MODE ? { devCode: code } : {}) };
}

// Verifies a code. On success deletes it (single-use) and returns the purpose.
export function verifyOtp(email, purpose, code) {
  if (!email || !code || !isOtpPurpose(purpose)) {
    return { error: 'Missing email, purpose or code', code: 400 };
  }
  const row = getEmailCode(String(email), String(purpose));
  if (!row) return { error: 'No code found. Request a new one.', code: 400 };

  if (Number(row.expires_at) < Date.now()) {
    deleteEmailCode(String(email), String(purpose));
    return { error: 'That code has expired. Request a new one.', code: 400 };
  }

  const mine = Buffer.from(hashCode(String(code)));
  const theirs = Buffer.from(row.code_hash);
  const match =
    mine.length === theirs.length && timingSafeEqual(mine, theirs);

  if (!match) {
    bumpCodeAttempts(String(email), String(purpose));
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      deleteEmailCode(String(email), String(purpose));
    }
    return { error: 'Incorrect code. Please check and try again.', code: 400 };
  }

  deleteEmailCode(String(email), String(purpose));

  if (purpose === 'verify') {
    const user = getUserByEmail(String(email));
    if (!user) return { error: 'No account found for that email.', code: 400 };
    markEmailVerified(user.id);
    return { ok: true, user };
  }

  // login purpose: passwordless. Existing account or create one on the fly.
  let user = getUserByEmail(String(email));
  if (!user) {
    user = createUser({
      name: nameFromEmail(String(email)),
      email: String(email),
      passwordHash: null,
      emailVerified: 1,
    });
  }
  return { ok: true, user };
}

// ---- Phone OTP -------------------------------------------------------------

// Issues a fresh code for a phone. Rate-limited per phone. In dev mode (no
// Twilio key) returns devCode so the UI can show it on screen.
export async function issuePhoneCode(phone, purpose) {
  const p = normalizePhone(phone);
  if (!isPhoneOk(p) || !isPhonePurpose(purpose)) {
    return { error: 'Enter a valid phone number (e.g. +91 98765 43210 or 98765 43210).', code: 400 };
  }
  const recent = countRecentPhoneCodes(p, 15);
  if (recent >= MAX_CODES_PER_15MIN) {
    return { error: 'Too many codes sent to this number. Try again in a few minutes.', code: 429 };
  }
  const code = generateCode();
  savePhoneCode({
    phone: p,
    purpose,
    codeHash: hashCode(code),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
  });
  if (!SMS_DEV_MODE) {
    await sendSms(p, `Your SportScore code is ${code}. It expires in 10 minutes.`);
  }
  return { ok: true, phone: p, ...(SMS_DEV_MODE ? { devCode: code } : {}) };
}

// Verifies a phone code. `login` maps to the account that owns the number;
// `register`/`verify_own` just prove ownership (account handling is the caller's).
export function verifyPhoneCode(phone, purpose, code) {
  const p = normalizePhone(phone);
  if (!p || !code || !isPhonePurpose(purpose)) {
    return { error: 'Phone, purpose and code are required', code: 400 };
  }
  const row = getPhoneCode(p, purpose);
  if (!row) return { error: 'No code found. Request a new one.', code: 400 };

  if (Number(row.expires_at) < Date.now()) {
    deletePhoneCode(p, purpose);
    return { error: 'That code has expired. Request a new one.', code: 400 };
  }

  const mine = Buffer.from(hashCode(String(code)));
  const theirs = Buffer.from(row.code_hash);
  const match = mine.length === theirs.length && timingSafeEqual(mine, theirs);

  if (!match) {
    bumpPhoneAttempts(p, purpose);
    if (row.attempts + 1 >= MAX_ATTEMPTS) deletePhoneCode(p, purpose);
    return { error: 'Incorrect code. Please check and try again.', code: 400 };
  }

  deletePhoneCode(p, purpose);

  if (purpose === 'login') {
    const user = getUserByPhone(p);
    if (!user) {
      return { error: 'No account is registered with that number yet. Sign up first.', code: 400 };
    }
    return { ok: true, phone: p, user };
  }
  return { ok: true, phone: p };
}
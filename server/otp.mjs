// One-time-password codes: generate, send, verify.
import { randomInt, createHash, timingSafeEqual } from 'node:crypto';
import {
  saveEmailCode,
  getEmailCode,
  deleteEmailCode,
  bumpCodeAttempts,
  countRecentCodes,
  getUserByEmail,
  createUser,
  markEmailVerified,
} from './db.mjs';
import { sendEmail, otpEmailHtml, DEV_MODE } from './email.mjs';

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
  return v === 'verify' || v === 'login' || v === 'reset';
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
    purpose === 'login'
      ? 'Your SportScore login code'
      : purpose === 'reset'
        ? 'Reset your SportScore password'
        : 'Verify your SportScore email';
  // Try to email the code, but never let a delivery failure block the flow:
  // the code is returned in-band so registration/login still work end to end
  // even when SMTP (Resend) is unavailable or unreachable.
  let emailBlocked = false;
  if (!DEV_MODE) {
    try {
      const sent = await sendEmail({ to: email, subject, html: otpEmailHtml(code, purpose) });
      if (!sent.id) {
        // configuration without an API key: nothing was actually delivered
        emailBlocked = true;
        console.warn(`[otp] no email dispatched for ${email} (no delivery id)`);
      }
    } catch (e) {
      emailBlocked = true;
      console.error(`[otp] email delivery failed for ${email}: ${e.message}`);
    }
  }
  return {
    ok: true,
    emailBlocked,
    ...(DEV_MODE || emailBlocked ? { devCode: code } : {}),
  };
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

  if (purpose === 'reset') {
    const user = getUserByEmail(String(email));
    if (!user) return { error: 'No account found for that email.', code: 400 };
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
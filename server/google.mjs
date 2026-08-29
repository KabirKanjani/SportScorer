// Google OAuth 2.0 "Sign in with Google" (server-side flow).
// Configure with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from the Google Cloud
// Console; BASE_URL is used to build the redirect URI.

import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'node:crypto';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL =
  process.env.BASE_URL ||
  `http://localhost:${process.env.PORT || 4321}`;

const REDIRECT_URI = `${BASE_URL}/api/auth/google/callback`;

export const googleConfigured = () => !!(CLIENT_ID && CLIENT_SECRET);

// Short-lived, single-use state tokens to prevent CSRF on the callback.
// Each entry also remembers where to send the browser afterwards, so a mobile
// app can land back on its own origin (e.g. https://localhost) after sign-in.
const pendingStates = new Map(); // state -> { expiresAt, redirect }
const STATE_TTL = 10 * 60 * 1000;

export function newOAuthState(redirect = '') {
  const state = randomBytes(24).toString('hex');
  pendingStates.set(state, { expiresAt: Date.now() + STATE_TTL, redirect });
  return state;
}

// Returns the redirect target, or null when the state is invalid/expired.
export function consumeOAuthState(state) {
  const rec = pendingStates.get(state);
  if (!rec || Date.now() > rec.expiresAt) return null;
  pendingStates.delete(state);
  return rec.redirect || '';
}

export function googleAuthUrl(state) {
  const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  return client.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'profile', 'email'],
    state,
  });
}

// Exchanges the callback code for a verified Google profile.
// Returns { email, name, sub } or throws on failure.
export async function exchangeGoogleCode(code) {
  const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error('Missing id_token from Google');
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: CLIENT_ID,
  });
  const p = ticket.getPayload();
  if (!p) throw new Error('No payload in Google token');
  if (!p.email || !p.sub) throw new Error('Google did not return an email');
  if (p.email_verified === false) {
    throw new Error('Your Google email is not verified with Google');
  }
  return { email: p.email, name: p.name || p.email, sub: p.sub };
}

export { BASE_URL };
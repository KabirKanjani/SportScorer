// Client-side error tracking through the Sentry loader script mounted in
// index.html (it carries the public client key, so no DSN is needed here).
//
// The loader's synchronous window.Sentry STUB only buffers init/onLoad until
// the real SDK finishes downloading. Methods like setUser/captureException
// don't exist on the stub, so every call is queued here and flushed once the
// SDK reports ready. If the loader never loads (CDN blocked), calls simply
// no-op — the app must never depend on Sentry.

import { API_BASE } from './api.js';

const sdk = () => (typeof window !== 'undefined' ? window.Sentry : undefined);

let available = false;
try {
  available = !!sdk();
} catch {
  available = false;
}

const pending = [];
let ready = false;

function flush() {
  const S = sdk();
  if (!ready || !S || typeof S.setUser !== 'function') return;
  while (pending.length) {
    const op = pending.shift();
    try {
      op(S);
    } catch {
      /* never let Sentry break the app */
    }
  }
}

function queue(op) {
  if (!available) return; // loader absent entirely: nothing will ever arrive
  pending.push(op);
  flush();
}

export async function bootSentry() {
  const S = sdk();
  if (!S || typeof S.init !== 'function') return;
  try {
    const res = await fetch(API_BASE + '/api/sentry/config', { credentials: 'include' });
    if (!res.ok) return;
    const cfg = await res.json();
    if (typeof S.onLoad === 'function') {
      S.onLoad(() => {
        ready = true;
        flush();
      });
    }
    // Calling init on the stub is what makes the loader fetch and run the SDK.
    S.init({
      environment: cfg.environment || 'development',
      release: cfg.release || undefined,
      tracesSampleRate: 0.05,
    });
  } catch {
    /* offline or not configured — skip */
  }
}

export function tagSentryUser(user) {
  const payload = user
    ? { id: String(user.id), email: user.email, username: user.username || undefined }
    : null;
  queue((S) => S.setUser(payload));
}

export function reportClientException(error, extra) {
  queue((S) => S.captureException(error, extra));
}
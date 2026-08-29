// Sentry backend glue. No op (and no network) until a SENTRY_DSN is set in the
// environment, so local/dev runs never talk to Sentry.

import * as Sentry from '@sentry/node';

const DSN = process.env.SENTRY_DSN || '';
export const SENTRY_CONFIGURED = !!DSN;
export const sentryDsn = DSN;

let done = false;

export function initSentry() {
  if (!DSN || done) return false;
  done = true;
  Sentry.init({
    dsn: DSN,
    environment:
      process.env.NODE_ENV === 'production' ? 'production' : 'development',
    release: process.env.RENDER_GIT_COMMIT
      ? `sportscore@${String(process.env.RENDER_GIT_COMMIT).slice(0, 7)}`
      : 'sportscore@dev',
    // Keep traces rare on the free tier: errors are the priority.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,
    integrations: [Sentry.expressIntegration()],
  });
  return true;
}

export { Sentry };

export function captureException(err) {
  if (DSN) Sentry.captureException(err);
  else console.error('[sentry] (unconfigured)', err);
}
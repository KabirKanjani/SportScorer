// Lightweight fixed-window rate limiting keyed by client IP.
// Localhost is always allowed through so dev/test harnesses never self-throttle.

const WINDOW_MS = 60 * 1000;
const buckets = new Map();

const DEV_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || 'unknown';
}

export function rateLimiter({ max, windowMs = WINDOW_MS, name = 'rl' }) {
  return (req, res, next) => {
    const ip = clientIp(req);
    if (DEV_IPS.has(ip)) return next();

    const key = `${name}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now - b.t0 > windowMs) {
      if (buckets.size > 20000) buckets.clear();
      b = { t0: now, n: 0 };
      buckets.set(key, b);
    }
    b.n += 1;
    if (b.n > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  };
}

const PRUNE_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (now - b.t0 > WINDOW_MS) buckets.delete(key);
  }
}, PRUNE_MS).unref();
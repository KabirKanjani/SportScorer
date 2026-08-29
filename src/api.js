// Small fetch wrapper for the SportScore backend API.
//
// On the web the frontend and API share an origin, so paths are relative.
// Inside the bundled Capacitor app the SPA ships locally (https://localhost /
// capacitor://localhost) while the API stays on the hosted origin, so we prefix
// every request with the remote base.

const HOST = 'https://sportscore.onrender.com';

const IS_NATIVE =
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

export const API_BASE = IS_NATIVE ? HOST : '';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// WebSocket URL for a specific match (or the live feed when matchId is null).
export function wsUrl(matchId = null) {
  let base;
  if (IS_NATIVE) {
    base = `${HOST.replace(/^http/, 'ws')}/ws`;
  } else {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    base = `${proto}://${location.host}/ws`;
  }
  return matchId ? `${base}?match=${encodeURIComponent(matchId)}` : base;
}
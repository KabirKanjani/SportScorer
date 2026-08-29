// Full end-to-end on PROD: register with no email, verify via the in-band code,
// create + start a match, score points, confirm it appears in the feed.
const BASE = process.env.TEST_BASE || 'https://sportscore.onrender.com';
const req = async (path, { method = 'GET', body, cookie } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
};
let failed = 0;
const check = (c, m) => { console.log((c ? '  ok ' : '  FAIL ***** ') + m); if (!c) failed++; };

const email = `e2e${Date.now()}@test.com`;
let r = await req('/api/register', { method: 'POST', body: { name: 'Prod E2E', email, password: 'secret1' } });
check(r.status === 200, 'register 200 on prod');
check(!!r.setCookie, 'session cookie set on register');
check(!!r.data?.devCode, 'verification code returned in-band');
const cookie = r.setCookie.split(';')[0];

r = await req('/api/otp/verify', { method: 'POST', cookie, body: { email, purpose: 'verify', code: r.data.devCode } });
check(r.status === 200, 'email verified with in-band code');

r = await req('/api/me', { cookie });
const userId = r.data?.user?.id;
const p2email = `p2${Date.now()}@test.com`;
r = await req('/api/register', { method: 'POST', body: { name: 'Prod P2', email: p2email, password: 'secret2' } });
check(r.status === 200 && !!r.data?.devCode && !!r.setCookie, 'second player registers');
const cookie2 = r.setCookie.split(';')[0];
r = await req('/api/otp/verify', { method: 'POST', cookie: cookie2, body: { email: p2email, purpose: 'verify', code: r.data.devCode } });
const userId2 = (await req('/api/me', { cookie: cookie2 })).data?.user?.id;

r = await req('/api/matches', {
  method: 'POST',
  cookie,
  body: { sport: 'tennis', sides: { a: [userId], b: [userId2] }, sets: 2, preMatch: { detailPrompt: true } },
});
check(r.status === 200, 'match created on prod');
const mid = r.data?.match?.id;
r = await req(`/api/matches/${mid}/toss`, { method: 'POST', cookie, body: { serverFirst: 0 } });
check(r.status === 200, 'coin toss recorded on prod');
r = await req(`/api/matches/${mid}/start`, { method: 'POST', cookie });
check(r.status === 200, 'creator starts the match');

r = await req(`/api/matches/${mid}/action`, { method: 'POST', cookie, body: { action: { type: 'point', player: 0 } } });
check(r.status === 200, 'point scored on prod');
r = await req(`/api/matches/${mid}/action`, { method: 'POST', cookie, body: { action: { type: 'detail', detail: 'Winner', key: 'winner', player: 0 } } });
check(r.status === 200, 'point detail recorded on prod');
r = await req(`/api/matches/${mid}`, { cookie });
check(r.data?.match?.status === 'live', 'match is live on prod');
check(r.data?.events?.some((e) => e.actor?.name === 'Prod E2E'), 'audit trail carries the actor');
check(r.data?.events?.some((e) => e.kind === 'winner' && e.playerIdx === 0), 'detail event carries structured kind + side');

r = await req('/api/matches?limit=5', { cookie });
check(r.data?.matches?.some((m) => m.id === mid), 'live match appears in the feed');

console.log(failed ? `\n${failed} FAILURES` : '\nPROD END-TO-END OK');
process.exit(failed ? 1 : 0);
// Prod-like flow: NODE_ENV=production + a broken Resend key. Registration and
// OTP login must still work end to end thanks to the in-band code fallback.
const BASE = process.env.TEST_BASE || 'http://localhost:4322';
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
const check = (c, m) => { console.log((c ? '  ok ' : '  FAIL ') + m); if (!c) failed++; };

const email = `prodlike${Date.now()}@test.com`;

let r = await req('/api/register', { method: 'POST', body: { name: 'Prod Reg', email, password: 'secret1' } });
check(r.status === 200, `register returns 200 not 502 (${r.data?.error || r.status})`);
check(!!r.setCookie, 'register sets a session cookie');
check(r.data?.needsVerification === true, 'needsVerification flagged');
check(!!r.data?.devCode && r.data?.emailBlocked === true, 'devCode surfaced in-band with emailBlocked true');
const c1 = r.setCookie.split(';')[0];

r = await req('/api/otp/verify', { method: 'POST', body: { email, purpose: 'verify', code: r.data.devCode } });
check(r.status === 200, 'verify with in-band code succeeds');
check(!!r.setCookie, 'verify sets a session cookie');

r = await req('/api/me', { cookie: c1 });
check(r.data?.user?.name === 'Prod Reg', 'session persists for the registered user');

// passwordless OTP login path with blocked delivery
const email2 = `otp${Date.now()}@test.com`;
r = await req('/api/otp/send', { method: 'POST', body: { email: email2, purpose: 'login' } });
check(r.status === 200 && r.data?.devCode && r.data?.emailBlocked === true, 'login code surfaced in-band');
r = await req('/api/otp/verify', { method: 'POST', body: { email: email2, purpose: 'login', code: r.data?.devCode } });
check(r.status === 200 && !!r.setCookie, 'otp login completes with a session');

console.log(failed ? `\n${failed} FAILURES` : '\nPROD-LIKE FLOW OK');
process.exit(failed ? 1 : 0);
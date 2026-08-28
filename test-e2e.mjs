// End-to-end smoke test of the SportScore HTTP API.
const BASE = 'http://localhost:4321';

async function req(path, { method = 'GET', body, cookie } = {}) {
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
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data, setCookie };
}

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { failures++; console.error('  ✗ FAIL:', msg); }
}

const email = `p${Date.now()}@test.com`;
const email2 = `q${Date.now()}@test.com`;

// 1. register (now also issues a verification code in dev mode)
let r = await req('/api/register', { method: 'POST', body: { name: 'Alex', email, password: 'secret1' } });
check(r.status === 200 && r.data.user.name === 'Alex', 'register user 1');
check(r.data.needsVerification === true && r.data.user.emailVerified === false, 'new accounts start unverified');
const c1 = r.setCookie.split(';')[0];
const alexVerifyDev = r.data.devCode;

r = await req('/api/register', { method: 'POST', body: { name: 'Sam', email: email2, password: 'secret2' } });
check(r.status === 200, 'register user 2');
const c2 = r.setCookie.split(';')[0];
const samVerifyDev = r.data.devCode;

// dup register
r = await req('/api/register', { method: 'POST', body: { name: 'Another', email, password: 'xxxxxx' } });
check(r.status === 409, 'duplicate email rejected');

// 2. me
r = await req('/api/me', { cookie: c1 });
check(r.data.user?.name === 'Alex' && r.data.user.emailVerified === false, 'me returns logged in (unverified) user');
const alexId = r.data.user.id;

// 3. email OTP verification flow
r = await req('/api/otp/send', { method: 'POST', body: { email, purpose: 'verify' } });
check(r.status === 200 && r.data.ok, 'otp send for verify');
const devCode = r.data.devCode;

r = await req('/api/otp/verify', { method: 'POST', body: { email, purpose: 'verify', code: '000000' } });
check(r.status === 400, 'wrong otp rejected');

r = await req('/api/otp/verify', { method: 'POST', body: { email, purpose: 'verify', code: devCode } });
check(r.status === 200 && r.data.ok, 'correct otp verifies email');

r = await req('/api/me', { cookie: c1 });
check(r.data.user.emailVerified === true, 'me now shows verified');

// Sam also verifies (straight from the register-time code)
r = await req('/api/otp/verify', { method: 'POST', body: { email: email2, purpose: 'verify', code: samVerifyDev } });
check(r.status === 200, 'sam verifies with register code');

// 4. passwordless OTP login creates + signs in an account
const otpEmail = `otp${Date.now()}@test.com`;
r = await req('/api/otp/send', { method: 'POST', body: { email: otpEmail, purpose: 'login' } });
check(r.status === 200 && !!r.data.devCode, 'otp login code issued (dev mode)');
r = await req('/api/otp/verify', { method: 'POST', body: { email: otpEmail, purpose: 'login', code: r.data.devCode } });
const cOtp = r.setCookie ? r.setCookie.split(';')[0] : null;
check(r.status === 200 && r.data.ok && cOtp, 'otp login creates account + cookie');
r = await req('/api/me', { cookie: cOtp });
check(r.data.user?.email === otpEmail && r.data.user.emailVerified === true, 'otp-logged-in user is verified');

// 5. Google sign-in (credentials configured on this box)
r = await req('/api/auth/google/config');
check(r.data.available === true, 'google reports configured');
const gres = await fetch(BASE + '/api/auth/google', { redirect: 'manual' });
check(
  gres.status === 302 && (gres.headers.get('location') || '').startsWith('https://accounts.google.com'),
  'google redirects to accounts.google.com'
);

// 5b. Phone-first signup (phone is the main login)
const phoneP = `+9199${Date.now().toString().slice(-8)}`;
const phoneB = `+9170${Date.now().toString().slice(-8)}`;
r = await req('/api/register', { method: 'POST', body: { name: 'Priya', phone: phoneP } });
check(r.status === 200 && r.data.needsVerification === true, 'phone-first register');
const cPhone = r.setCookie.split(';')[0];
const phoneDev = r.data.devCode;
r = await req('/api/me', { cookie: cPhone });
check(r.data.user.phone === phoneP && r.data.user.phoneVerified === false, 'phone account created unverified');

r = await req('/api/phone/verify', { method: 'POST', body: { phone: phoneP, purpose: 'register', code: '000000' } });
check(r.status === 400, 'wrong phone code rejected');
r = await req('/api/phone/verify', { method: 'POST', body: { phone: phoneP, purpose: 'register', code: phoneDev } });
check(r.status === 200 && r.data.ok, 'phone register code verifies');
r = await req('/api/me', { cookie: cPhone });
check(r.data.user.phoneVerified === true, 'phone shows verified');

r = await req('/api/register', { method: 'POST', body: { name: 'Dup', phone: phoneP } });
check(r.status === 409, 'duplicate phone rejected');

// phone login: no password needed
r = await req('/api/phone/send', { method: 'POST', body: { phone: phoneP, purpose: 'login' } });
const phoneLoginDev = r.data.devCode;
check(r.status === 200 && !!phoneLoginDev, 'phone login code issued (dev)');
r = await req('/api/phone/send', { method: 'POST', body: { phone: '+19999999999', purpose: 'login' } });
check(r.status === 400, 'login refused for unregistered number');
r = await req('/api/phone/send', { method: 'POST', body: { phone: phoneP, purpose: 'login' } });
check(r.status === 200 && r.data.devCode && r.data.devCode !== phoneLoginDev, 're-sending a code mints a fresh one');
r = await req('/api/phone/verify', { method: 'POST', body: { phone: phoneP, purpose: 'login', code: r.data.devCode } });
const cPhoneLogin = r.setCookie ? r.setCookie.split(';')[0] : null;
check(r.status === 200 && cPhoneLogin, 'phone login signs in with cookie');
r = await req('/api/me', { cookie: cPhoneLogin });
check(r.data.user.name === 'Priya', 'phone login lands on the right account');

// existing user attaches their phone (settings) — must be logged in
r = await req('/api/phone/send', { method: 'POST', body: { phone: phoneB, purpose: 'verify_own' } });
check(r.status === 401, 'attach-own-phone requires login');
r = await req('/api/phone/send', { method: 'POST', cookie: cOtp, body: { phone: phoneB, purpose: 'verify_own' } });
check(r.status === 200 && !!r.data.devCode, 'verify_own code sent to logged-in user');
r = await req('/api/phone/verify', { method: 'POST', cookie: cOtp, body: { phone: phoneB, purpose: 'verify_own', code: r.data.devCode } });
check(r.status === 200, 'verify_own links the number to the account');
r = await req('/api/me', { cookie: cOtp });
check(r.data.user.phone === phoneB && r.data.user.phoneVerified === true, 'attached phone saved + verified');

// cannot claim a number someone else owns
r = await req('/api/phone/send', { method: 'POST', cookie: cOtp, body: { phone: phoneP, purpose: 'verify_own' } });
check(r.status === 409, 'taking another account phone refused');

// searching by phone number resolves the account (opponent picker)
const psearch = await req('/api/users?q=' + encodeURIComponent(phoneP));
const priya = psearch.data.users.find((u) => u.email === `${phoneP.replace(/[^+\d]/g, '')}@phone`);
check(!!priya, 'opponent findable by phone number');
r = await req('/api/matches', {
  method: 'POST',
  cookie: c1,
  body: { sport: 'tennis', sides: { a: [alexId], b: [priya.id] } },
});
const pmId = r.data.match?.id;
r = await req(`/api/matches/${pmId}`, { cookie: c1 });
check(r.data.confirmInfo?.required?.some((p) => p.name === 'Priya'), 'phone-resolved opponent added to match');

// 6. create match (bad payload must be rejected, not crash)
r = await req('/api/matches', {
  method: 'POST',
  cookie: c1,
  body: { sport: 'tennis', sides: { a: [999999], b: [] } },
});
check(r.status === 400, 'bad match payload rejected');

// search users
let search = await req('/api/users?q=Sam');
check(search.data.users.some((u) => u.email === email2), 'search users');

const sam = search.data.users.find((u) => u.email === email2);

r = await req('/api/matches', {
  method: 'POST',
  cookie: c1,
  body: { sport: 'tennis', sides: { a: [alexId], b: [sam.id] } },
});
check(r.status === 200, `create real match (${r.data?.error || r.data?.match?.id})`);
const mid = r.data.match?.id;
// creator is implicitly the first scorer
check(r.data.full?.scorers?.some((s) => s.name === 'Alex'), 'creator starts as scorer');

// 7. score points
r = await req(`/api/matches/${mid}/action`, { method: 'POST', cookie: c1, body: { action: { type: 'point', player: 0 } } });
check(r.status === 200, 'score a point');
r = await req(`/api/matches/${mid}/action`, { method: 'POST', cookie: c1, body: { action: { type: 'point', player: 0 } } });
check(r.status === 200, 'score second point');
r = await req(`/api/matches/${mid}/action`, { method: 'POST', cookie: c1, body: { action: { type: 'undo' } } });
check(r.status === 200, 'undo');

// stranger cannot score, but the creator can invite them as scorer
r = await req('/api/register', { method: 'POST', body: { name: 'Stranger', email: `s${Date.now()}@t.com`, password: 'xxxxxx' } });
const strangerCookie = r.setCookie.split(';')[0];
const strangerId = r.data.user.id;
r = await req(`/api/matches/${mid}/action`, { method: 'POST', cookie: strangerCookie, body: { action: { type: 'point', player: 0 } } });
check(r.status === 403, 'non-player cannot score');

r = await req(`/api/matches/${mid}/scorer`, { method: 'POST', cookie: c1, body: { userId: strangerId } });
check(r.status === 200 && r.data.scorers.some((s) => s.userId === strangerId), 'creator adds a scorer');

r = await req(`/api/matches/${mid}/scorer`, { method: 'POST', cookie: c1, body: { userId: strangerId } });
check(r.status === 400, 'duplicate scorer rejected');

// otp-logged-in user is neither player nor scorer -> still forbidden
r = await req(`/api/matches/${mid}/action`, { method: 'POST', cookie: cOtp, body: { action: { type: 'point', player: 0 } } });
check(r.status === 403, 'unrelated user still cannot score');

// invited scorer can now operate the board, and it is recorded with their name
r = await req(`/api/matches/${mid}/action`, { method: 'POST', cookie: strangerCookie, body: { action: { type: 'point', player: 1 } } });
check(r.status === 200, 'added scorer can score');

// 8. match detail + events (audit trail shows the actor)
r = await req(`/api/matches/${mid}`);
check(r.data.state && r.data.events, 'match detail + events');
check(r.data.events.some((e) => e.detail.includes('Point')), 'events logged');
check(r.data.events.some((e) => e.actor?.name === 'Alex' || e.actor?.name === 'Stranger'), 'events carry actor names');
check(r.data.confirmInfo?.required?.length === 2, 'confirmInfo lists both players');

// 9. feed
r = await req('/api/matches?limit=10');
check(Array.isArray(r.data.matches) && r.data.matches.some((m) => m.id === mid), 'feed contains match');

// 10. follow
r = await req(`/api/users/${sam.id}/follow`, { method: 'POST', cookie: c1 });
check(r.status === 200, 'follow Sam');
r = await req(`/api/users/${sam.id}`, { cookie: c1 });
check(r.data.isFollowing === true, 'following reflected on profile');
check(r.data.user.emailVerified === true, 'profile shows verified email');

// 11. finish a match, then both players confirm it
r = await req('/api/matches', {
  method: 'POST',
  cookie: c1,
  body: { sport: 'tabletennis', sides: { a: [alexId], b: [sam.id] } },
});
const ttId = r.data.match.id;
for (let g = 0; g < 3; g++) {
  for (let i = 0; i < 11; i++) {
    await req(`/api/matches/${ttId}/action`, { method: 'POST', cookie: c1, body: { action: { type: 'point', player: 0 } } });
  }
}
r = await req(`/api/matches/${ttId}`, { cookie: c1 });
check(r.data.match.status === 'finished', 'match finished after 3 games');
check(r.data.match.resultConfirmed === false, 'result starts unconfirmed');
check(r.data.canConfirm === true, 'player can see confirm action');

// until confirmed, stats must not change
r = await req(`/api/users/${alexId}`);
check(r.data.stats.total.played === 0, 'unconfirmed match excluded from stats');

// Alex confirms -> still needs Sam
r = await req(`/api/matches/${ttId}/confirm`, { method: 'POST', cookie: c1 });
check(r.status === 200 && r.data.allConfirmed === false, 'one confirmation is not enough');
// hasty re-confirm reports the same state
r = await req('/api/matches/' + ttId);
check(r.data.confirmInfo.done.length === 1, 'confirmInfo tracks who confirmed');

// non-participant cannot confirm
r = await req(`/api/matches/${ttId}/confirm`, { method: 'POST', cookie: strangerCookie });
check(r.status === 403, 'outsider cannot confirm');

// Sam confirms -> all confirmed, feed + stats update
r = await req(`/api/matches/${ttId}/confirm`, { method: 'POST', cookie: c2 });
check(r.status === 200 && r.data.allConfirmed === true, 'all confirmations make it official');
r = await req(`/api/matches/${ttId}`);
check(r.data.match.resultConfirmed === true, 'match flagged as confirmed result');
r = await req(`/api/users/${alexId}`);
check(r.data.stats.total.played === 1, 'confirmed match now counts in stats');
const tt = r.data.stats.bySport['tabletennis'];
check(tt && tt.wins >= 1, `Alex has a confirmed tabletennis win (${tt?.wins})`);
r = await req('/api/matches?limit=10');
check(r.data.matches.find((m) => m.id === ttId).resultConfirmed === true, 'feed shows confirmed result');

console.log(failures === 0 ? '\nALL E2E TESTS PASSED ✅' : `\n${failures} TEST(S) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);

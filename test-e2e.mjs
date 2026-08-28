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
  if (cond) console.log('  âœ“', msg);
  else { failures++; console.error('  âœ— FAIL:', msg); }
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

// 5b. Usernames: unique handles friends use to find you and add you to matches
const priyaEmail = `priya${Date.now()}@test.com`;
const priyaUser = `priya_${Date.now().toString().slice(-6)}`;
r = await req('/api/register', { method: 'POST', body: { name: 'Priya', email: priyaEmail, password: 'secret3', username: priyaUser } });
check(r.status === 200 && r.data.needsVerification === true, 'register with a chosen username');
const cPriya = r.setCookie.split(';')[0];
check(r.data.user.username === priyaUser, 'chosen username saved');
const priyaDev = r.data.devCode;

r = await req('/api/register', { method: 'POST', body: { name: 'Dup', email: `dup${Date.now()}@test.com`, password: 'secret3', username: priyaUser } });
check(r.status === 409, 'duplicate username rejected');

r = await req('/api/register', { method: 'POST', body: { name: 'Bad', email: `bad${Date.now()}@test.com`, password: 'secret4', username: 'no pe' } });
check(r.status === 400, 'malformed username rejected');

r = await req('/api/register', { method: 'POST', body: { name: 'Casey', email: `casey${Date.now()}@test.com`, password: 'secret5' } });
check(r.status === 200 && /^[a-z0-9_]{3,20}$/.test(r.data.user.username || ''), 'username auto-generated when blank');

r = await req('/api/otp/verify', { method: 'POST', body: { email: priyaEmail, purpose: 'verify', code: priyaDev } });
check(r.status === 200, 'priya verifies email');
r = await req('/api/me', { cookie: cPriya });
check(r.data.user.username === priyaUser && r.data.user.emailVerified === true, 'username shows on profile');

// otp-created accounts get an auto username too
r = await req('/api/me', { cookie: cOtp });
check(/^[a-z0-9_]{3,20}$/.test(r.data.user.username || ''), 'otp-login account has a username');

// searching by username resolves the account (opponent picker)
const usearch = await req('/api/users?q=' + encodeURIComponent(priyaUser));
const priya = usearch.data.users.find((u) => u.username === priyaUser);
check(!!priya, 'opponent findable by username');
r = await req('/api/matches', {
  method: 'POST',
  cookie: c1,
  body: { sport: 'tennis', sides: { a: [alexId], b: ['@' + priyaUser] } },
});
const pmId = r.data.match?.id;
r = await req(`/api/matches/${pmId}`, { cookie: c1 });
check(r.data.confirmInfo?.required?.some((p) => p.name === 'Priya'), 'username-resolved opponent added to match');

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
r = await req('/api/matches?limit=100');
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
r = await req('/api/matches?limit=100');
check(r.data.matches.find((m) => m.id === ttId).resultConfirmed === true, 'feed shows confirmed result');

// ---- 9. Tournaments: creation, draw, linked matches, champion ----------------
const alexU = (await req('/api/me', { cookie: c1 })).data.user?.username;
const samU = (await req('/api/me', { cookie: c2 })).data.user?.username;
const otpU = (await req('/api/me', { cookie: cOtp })).data.user?.username;

r = await req('/api/tournaments', { method: 'POST', cookie: c1, body: { name: '   ', sport: 'tennis' } });
check(r.status === 400, 'tournament requires a name');
r = await req('/api/tournaments', { method: 'POST', cookie: c1, body: { name: 'E2E Cup', sport: 'bogus' } });
check(r.status === 400, 'tournament requires a real sport');

r = await req('/api/tournaments', { method: 'POST', cookie: c1, body: { name: 'E2E Cup', sport: 'tennis' } });
check(r.status === 200 && r.data.tournament.status === 'draft', 'create tournament as draft');
const tId = r.data.tournament.id;
check(r.data.tournament.players.length === 1 && r.data.tournament.players[0].name === 'Alex', 'creator auto-entered as player 1');
check(r.data.tournament.canStart === false, 'creator cannot start with 1 player');

r = await req(`/api/tournaments/${tId}/participants`, { method: 'POST', cookie: c1, body: { usernames: [samU, priyaUser, 'no_such_user_xyz'] } });
check(r.status === 200 && r.data.tournament.players.length === 3, 'creator adds players by username');
check(r.data.invalid.length === 1, 'unknown username reported invalid');

r = await req(`/api/tournaments/${tId}/join`, { method: 'POST', cookie: cOtp });
check(r.status === 200 && r.data.tournament.players.length === 4, 'otp user joins by themselves');

r = await req(`/api/tournaments/${tId}/start`, { method: 'POST', cookie: strangerCookie });
check(r.status === 403, 'stranger cannot start the tournament');

r = await req(`/api/tournaments/${tId}`);
const draftBefore = r.data.tournament;
check(draftBefore.status === 'draft' && draftBefore.rounds.length === 0, 'draft has no bracket yet');

r = await req(`/api/tournaments/${tId}/start`, { method: 'POST', cookie: c1 });
check(r.status === 200 && r.data.tournament.status === 'live', 'creator starts the tournament');
const live = r.data.tournament;
check(live.rounds.length === 2, '4 players â†’ 2 rounds');
check(live.rounds[0].fixtures.length === 2 && live.rounds[1].fixtures.length === 1, 'round 1 has 2 fixtures, final has 1');
check(live.players.every((p) => p.seed >= 1 && p.seed <= 4), 'every player got a seed (random draw)');
const round1 = live.rounds[0].fixtures;
check(round1.every((f) => f.player1 && f.player2), 'no byes with exactly 4 players');
check(round1[1].round === 1 && round1[1].position === 1, 'fixture positions laid out');

r = await req(`/api/tournaments/${tId}/participants`, { method: 'POST', cookie: c1, body: { usernames: [alexU] } });
check(r.status === 400, 'cannot add players after the draw');

const strangerTry = await req(`/api/fixtures/${round1[0].id}/start-match`, { method: 'POST', cookie: strangerCookie });
check(strangerTry.status === 403, 'stranger cannot open a fixture match');

const fxStart = await req(`/api/fixtures/${round1[0].id}/start-match`, { method: 'POST', cookie: c2 });
check(fxStart.status === 200 && fxStart.data.matchId, 'any participant can start the fixture match');
const fxMatchId = fxStart.data.matchId;

r = await req(`/api/matches/${fxMatchId}`, { cookie: c1 });
check(r.data.match.tournament && r.data.match.tournament.id === tId && r.data.match.tournament.round === 1, 'match carries its tournament ref');

r = await req(`/api/tournaments/${tId}`);
const withLive = r.data.tournament;
check(withLive.rounds[0].fixtures.find((f) => f.id === round1[0].id).status === 'live', 'fixture marked live once its match is running');

// finish the first fixture: side 0 wins. The person who started it (Sam) is its scorer.
async function finishMatch(mid, cookie, winnerSide) {
  for (let g = 0; g < 12; g++) {
    for (let i = 0; i < 4; i++) {
      const a = await req(`/api/matches/${mid}/action`, { method: 'POST', cookie, body: { action: { type: 'point', player: winnerSide } } });
      if (a.status !== 200) return a.status;
    }
  }
  return 200;
}
check(await finishMatch(fxMatchId, c2, 0) === 200, 'fixture match can be scored to completion');

r = await req(`/api/tournaments/${tId}`);
const afterQ1 = r.data.tournament;
const played = afterQ1.rounds[0].fixtures.find((f) => f.id === round1[0].id);
check(played.status === 'done' && played.winner?.id === round1[0].player1.id, 'fixture winner resolved from the live match');

// second quarter also needs a winner before the final fills in
const fxB = round1[1];
const fxBStart = await req(`/api/fixtures/${fxB.id}/start-match`, { method: 'POST', cookie: c1 });
check(fxBStart.status === 200, 'second fixture match can be started (even by the creator)');
check(await finishMatch(fxBStart.data.matchId, c1, 1) === 200, 'second fixture scored (created+scored by Alex)');

r = await req(`/api/tournaments/${tId}`);
const afterQ2 = r.data.tournament;
const finalNode = afterQ2.rounds[1].fixtures[0];
check(
  finalNode.player1?.id === round1[0].player1.id && finalNode.player2?.id === round1[1].player2.id,
  'both winners advance into the final'
);

const finalStart = await req(`/api/fixtures/${finalNode.id}/start-match`, { method: 'POST', cookie: c1 });
check(finalStart.status === 200 && finalStart.data.matchId, 'final can be started');
check(await finishMatch(finalStart.data.matchId, c1, 1) === 200, 'final scored to completion');

r = await req(`/api/tournaments/${tId}`);
const done = r.data.tournament;
check(done.status === 'finished', 'tournament finished after the final');
check(done.champion && done.champion.id === round1[1].player2.id, 'champion is the final winner');
check(done.winner && done.winner.id === round1[1].player2.id, 'winner surfaced on the tournament');

r = await req('/api/tournaments', { cookie: c1 });
check(r.status === 200 && r.data.tournaments.some((t) => t.id === tId), 'tournament appears in the list');

// byes: a 3-player draw produces a walkover in round 1
r = await req('/api/tournaments', { method: 'POST', cookie: c1, body: { name: 'Bye Cup', sport: 'padel' } });
const bId = r.data.tournament.id;
r = await req(`/api/tournaments/${bId}/participants`, { method: 'POST', cookie: c1, body: { usernames: [samU, otpU ?? 'player'] } });
r = await req(`/api/tournaments/${bId}/start`, { method: 'POST', cookie: c1 });
const bye = r.data.tournament;
const byeFixture = bye.rounds[0].fixtures.find((f) => f.isBye);
check(!!byeFixture && !!byeFixture.winner, '3 players â†’ round 1 has a resolved bye/walkover');

// tolerant player lookup: a freshly-registered display name resolves when adding
const tolStamp = Date.now().toString().slice(-7);
r = await req('/api/register', { method: 'POST', body: { name: `Tol${tolStamp}`, email: `tol${tolStamp}@test.com`, password: 'hunter22' } });
const tolC = r.setCookie.split(';')[0];
const tolName = r.data.user.name;
r = await req('/api/tournaments', { method: 'POST', cookie: c1, body: { name: 'Name Match Cup', sport: 'tennis' } });
const nmId = r.data.tournament.id;
r = await req(`/api/tournaments/${nmId}/participants`, { method: 'POST', cookie: c1, body: { usernames: [tolName] } });
check(r.status === 200 && r.data.added.length === 1, 'creator adds a player by display name (not username)');
// use a long-enough prefix that it can't collide with older e2e users lingering
// in the persistent local DB (short prefixes make the lookup ambiguous + flaky)
r = await req(`/api/tournaments/${nmId}/participants`, { method: 'POST', cookie: c1, body: { usernames: [tolName.slice(0, 8)] } });
check(r.status === 200 && r.data.added.length === 0 && r.data.invalid.length === 0, 'partial name adds an already-added player as a no-op');
r = await req('/api/users?q=' + encodeURIComponent(tolName.slice(0, 5)));
check(r.status === 200 && r.data.users.some((u) => u.name === tolName), 'user search finds people by name prefix');

// profile picture: upload a tiny PNG base64, confirm it shows up, then remove it
const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await req('/api/me/avatar', { method: 'POST', cookie: tolC, body: { data: tinyPng } });
check(r.status === 200 && r.data.user && r.data.user.avatar && r.data.user.avatar.endsWith('.png'), 'user uploads an avatar image');
const avFile = r.data.user.avatar;
r = await req('/api/me', { method: 'GET', cookie: tolC });
check(r.status === 200 && r.data.user && r.data.user.avatar === avFile, 'avatar persists on /api/me');
r = await req('/api/users/' + r.data.user.id, { method: 'GET' });
check(r.status === 200 && r.data.user && r.data.user.avatar === avFile, 'avatar shows on a player profile');
r = await req('/api/me/avatar', { method: 'DELETE', cookie: tolC });
check(r.status === 200 && r.data.user && r.data.user.avatar === null, 'user can remove their avatar');

console.log(failures === 0 ? '\nALL E2E TESTS PASSED âœ…' : `\n${failures} TEST(S) FAILED âŒ`);
process.exit(failures === 0 ? 0 : 1);


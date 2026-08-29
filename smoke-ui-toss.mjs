// One-off UI verification: post-creation toss, detail prompt under the score
// buttons, Wimbledon-style scoreline table.
import puppeteer from 'puppeteer-core';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.SMOKE_BASE || 'http://localhost:4321';
const emailA = `ua${Date.now()}@t.com`;
const emailB = `ub${Date.now()}@t.com`;

async function api(path, { method = 'GET', body, cookie } = {}) {
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
}

let failed = 0;
const check = (c, m) => { console.log((c ? '  ✓' : '  ✗') + ' ' + m); if (!c) failed++; };

const ra = await api('/api/register', { method: 'POST', body: { name: 'Aria', email: emailA, password: 'secret1' } });
const rb = await api('/api/register', { method: 'POST', body: { name: 'Blake', email: emailB, password: 'secret2' } });
const cA = ra.setCookie.split(';')[0];
const cB = rb.setCookie.split(';')[0];
const idA = ra.data.user.id;
const idB = rb.data.user.id;
await api('/api/otp/verify', { method: 'POST', body: { email: emailA, purpose: 'verify', code: ra.data.devCode } });
await api('/api/otp/verify', { method: 'POST', body: { email: emailB, purpose: 'verify', code: rb.data.devCode } });

const cm = await api('/api/matches', {
  method: 'POST',
  cookie: cA,
  body: { sport: 'tennis', sides: { a: [idA], b: [idB] }, sets: 1, preMatch: { detailPrompt: true, venue: 'Smoke Court' } },
});
check(cm.status === 200, `created match ${cm.data?.match?.id}`);
const mid = cm.data.match.id;

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
await page.setCookie({ name: 'ss_sess', value: cA.split('=')[1], domain: 'localhost', path: '/' });

// 1. New-match form: no coin-toss panel, has the point-detail toggle.
await page.goto(BASE + '/new-match', { waitUntil: 'networkidle0', timeout: 25000 });
await sleep(600);
const formPanels = await page.$$eval('.panel .panel-title', (els) => els.map((e) => e.textContent.trim()));
check(!formPanels.some((t) => t.toLowerCase().includes('coin toss')), 'no Coin toss panel on the creation form: ' + JSON.stringify(formPanels));
const hasToggle = await page.evaluate(() => !!document.querySelector('.detail-toggle') && !(document.querySelector('.panel-title')?.textContent || '').toLowerCase().includes('toss'));
check(hasToggle, 'creation form shows the point-detail toggle');

// 2. Match page: pre-game card with the toss flow (real player names).
await page.goto(BASE + `/match/${mid}`, { waitUntil: 'networkidle0', timeout: 25000 });
await sleep(900);
const flipBtn = await page.$('.toss-flip .btn.primary');
check(!!flipBtn, 'pregame card shows the toss flip button');
const tossCopy = await page.$$eval('.toss-flip p', (els) => els.map((e) => e.textContent).join(' '));
check(/real player names/.test(tossCopy), 'toss copy mentions real player names');
await flipBtn.click();
await sleep(1100);
const tossWinnerText = await page.evaluate(() => document.querySelector('.toss-winner')?.textContent || '');
check(/won the toss/.test(tossWinnerText) && (/Aria/.test(tossWinnerText) || /Blake/.test(tossWinnerText)), 'toss flip shows winner with real name: ' + tossWinnerText.trim());
const segTexts = await page.$$eval('.toss-choose .seg-btn', (els) => els.map((e) => e.textContent.trim()));
check(segTexts.includes('Aria') && segTexts.includes('Blake'), 'serve-first choices show real player names: ' + JSON.stringify(segTexts));
const blakeBtn = segTexts.indexOf('Blake');
await (await page.$$('.toss-choose .seg-btn'))[blakeBtn].click();
await sleep(700);
const toBeClicked = await page.evaluate(() => (document.querySelector('.seg-btn.active') || {}).textContent || '');
check(toBeClicked.trim() === 'Blake', 'server selection persisted (Blake serves first)');

// 3. Start the match, then scoreline table appears in set-column layout.
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('Start the match')) b.click();
  }
});
await sleep(1200);
const pregameGone = await page.evaluate(() => !document.querySelector('.pregame'));
check(pregameGone, 'pregame card gone after start');
const thead = await page.$$eval('.scoreline-table thead th', (els) => els.map((e) => e.textContent.trim()));
check(thead.includes('sets') && thead[thead.length - 1] === 'now', 'scoreline header is set-columns + now: ' + JSON.stringify(thead));
const rows = await page.$$eval('.scoreline-table tbody tr', (trs) => trs.map((tr) => {
  const tds = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
  return tds.join(' | ');
}));
check(rows.length === 2 && rows[0].includes('Aria') && rows[1].includes('Blake'), 'scoreline has both player rows');
check(rows[0].split('|').pop().trim() === '0-0', 'scoreline live column shows 0-0 pre-point: ' + rows[0]);

// 4. Score a point -> detail prompt appears directly under the point buttons.
const pointBtns = await page.$$('.point-btn');
check(pointBtns.length === 2, 'Controls show two point buttons');
await pointBtns[0].click();
await sleep(900);
const promptHead = await page.evaluate(() => document.querySelector('.point-detail-head')?.textContent || '');
check(/Aria/.test(promptHead) && /win the point/.test(promptHead), 'detail prompt appears after a point: ' + promptHead.trim());
const promptPlacement = await page.evaluate(() => {
  const sp = document.querySelector('.score-panel');
  const pb = sp?.querySelector('.point-buttons');
  const pd = sp?.querySelector('.point-detail');
  const controls = document.querySelector('.controls');
  const panels = controls ? [...controls.children] : [];
  const actionsIdx = panels.findIndex((p) => /Actions/.test(p.querySelector('.panel-title')?.textContent || ''));
  const spIdx = panels.indexOf(sp);
  const idx = (el, n) => (el && n ? Array.from(el.children).indexOf(n) : -1);
  return {
    inScorePanel: !!pd,
    afterButtons: idx(sp, pb) >= 0 && idx(sp, pd) > idx(sp, pb),
    beforeActions: spIdx >= 0 && actionsIdx > spIdx,
  };
});
check(promptPlacement.inScorePanel, 'prompt lives inside the Score panel');
check(promptPlacement.afterButtons, 'prompt is directly below the point buttons');
check(promptPlacement.beforeActions, 'prompt sits above the Actions panel');

// 5. Pick a detail chip -> disappears and lands in the timeline.
const chips = await page.$$('.point-detail-chips .chip');
check(chips.length >= 6, 'detail chips shown (' + chips.length + ')');
const chipText = await page.evaluate(() => document.querySelector('.point-detail-chips .chip')?.textContent.trim() || '');
await chips[0].click();
await sleep(700);
const promptGone = await page.evaluate(() => !document.querySelector('.point-detail'));
check(promptGone, 'prompt dismissed after pick');
const timeline = await page.$$eval('.event-row .event-detail', (els) => els.map((e) => e.textContent).join(' '));
check(timeline.includes(chipText), 'picked detail recorded to the timeline: "' + chipText + '"');
const nowCell = await page.$$eval('.scoreline-table tbody tr td.sl-col.now', (els) => els.map((e) => e.textContent.trim()));
check(nowCell[0] === '0-0', 'scoreline now column tracks the live set games: ' + JSON.stringify(nowCell));
const caption = await page.evaluate(() => document.querySelector('.sl-caption')?.textContent || '');
check(/current set/.test(caption) && caption.includes('Aria'), 'scoreline caption names the live set: ' + caption.trim());

console.log('\nruntime errors:', errors.length);
for (const e of errors.slice(0, 10)) console.log('  ' + e);
await browser.close();
console.log(failed ? `\n${failed} FAILURES` : '\nALL UI CHECKS PASSED');
process.exit(failed || errors.length ? 1 : 0);
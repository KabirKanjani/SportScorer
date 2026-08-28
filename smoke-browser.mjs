import puppeteer from 'puppeteer-core';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.SMOKE_BASE || 'http://localhost:4321';
const URLS = process.env.SMOKE_URLS ? process.env.SMOKE_URLS.split(',') : ['/', '/matches'];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300));
});

let failed = 0;
for (const url of URLS) {
  try {
    const resp = await page.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 25000 });
    await sleep(1200);
    const rootLen = await page.evaluate(() => (document.getElementById('root')?.innerText || '').length);
    const body = await page.evaluate(() => document.body.innerText.length);
    console.log(`[${resp.status()}] ${url} :: #root text=${rootLen} body=${body}`);
    if (resp.status() !== 200 || rootLen < 5) failed++;
  } catch (e) {
    console.log(`[ERR] ${url} :: ${e.message}`);
    failed++;
  }
}
console.log('runtime errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  ' + e);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
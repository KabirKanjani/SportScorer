// CDP check on the bundled WebView: confirms local bundle loaded, prod API is
// reachable, and the new post-creation toss/scoreline code rendered clean.
// Usage: node cdp-check.mjs <socket-suffix-pid>
import { setTimeout as sleep } from 'node:timers/promises';

const port = 9223;
const pid = process.argv[2];
import { execSync } from 'node:child_process';
const adb = `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`;
try { execSync(`"${adb}" forward --remove tcp:${port}`); } catch {}
execSync(`"${adb}" forward tcp:${port} localabstract:webview_devtools_remote_${pid}`);

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.log('NO PAGE TARGET'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

const issues = [];
await new Promise((res) => (ws.onopen = res));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') issues.push('EX ' + (m.params.exceptionDetails?.exception?.description || ''));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    issues.push('CON ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200));
  if (m.method === 'Network.loadingFailed') issues.push('NETFAIL ' + m.params.errorText);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400)
    issues.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url);
};

await send('Runtime.enable');
await send('Network.enable');
await sleep(5000);

const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.value;
const body = await evalJs('document.body.innerText.slice(0, 700)');
const rootLen = await evalJs('(document.getElementById("root")?.innerText || "").length');
const hasTable = await evalJs('!!document.querySelector(".scoreline-table")');

console.log('root text len:', rootLen);
console.log('body:', JSON.stringify(body));
console.log('scoreline-table present:', hasTable);
console.log('page url:', page.url);
console.log('issues:', issues.length);
issues.slice(0, 12).forEach((i) => console.log('  ' + i));
ws.close();
process.exit(issues.length ? 1 : 0);
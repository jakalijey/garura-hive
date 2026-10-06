import { build } from 'vite';
import * as Nimiq from '@nimiq/core';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createServer as createGameServer } from '../../server/server.mjs';

const CHROME = process.env.CHROME || undefined
const PW = process.env.PLAYWRIGHT || 'playwright-core';
const { chromium } = await import(PW);
const game = createGameServer({ dataDir: mkdtempSync(join(tmpdir(), 'hive-wal-')), humanEvery: 1e9, minTapGapMs: 0, autoPayouts: false,
  uraClaimedTotal: async () => 0, uraLinks: async () => [], payout: { enabled: false, send: async () => 'x' } });
await new Promise((r) => game.listen(0, '127.0.0.1', r));
process.env.VITE_API = `http://127.0.0.1:${game.address().port}`;
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const outDir = mkdtempSync(join(tmpdir(), 'hive-wal-dist-'));
await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } });
const html = readFileSync(join(outDir, 'index.html'), 'utf8');
const appSrv = http.createServer((q, s) => { s.setHeader('content-type', 'text/html'); s.end(html); });
await new Promise((r) => appSrv.listen(0, '127.0.0.1', r));
const app = `http://127.0.0.1:${appSrv.address().port}/`;
const vite = { close: async () => appSrv.close() };
const top = http.createServer((q, s) => { s.setHeader('content-type', 'text/html'); s.end(`<!doctype html><body style="margin:0">
<iframe id="f" src="${app}" sandbox="allow-scripts allow-forms allow-popups allow-modals" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
<script>
const OK = new Set(['listAccounts','getBalance','sign','sendBasicTransaction','sendBasicTransactionWithData']);
addEventListener('message', (ev) => { const w = document.getElementById('f').contentWindow; if (ev.source !== w) return; const v = ev.data; if (!v || v.tur !== 'hl-nimiq') return;
  if (v.islem === 'sor') { w.postMessage({ tur:'hl-nimiq', islem:'durum', var: !!window.nimiq }, '*'); return; }
  if (v.islem === 'cagir') { if (!OK.has(v.yontem)) return w.postMessage({ tur:'hl-nimiq', islem:'sonuc', id:v.id, ok:false, hata:{kod:'desteklenmiyor'} }, '*');
    window.nimiq[v.yontem](...(v.args||[])).then((r) => w.postMessage({ tur:'hl-nimiq', islem:'sonuc', id:v.id, ok:true, sonuc:r }, '*'), (e) => w.postMessage({ tur:'hl-nimiq', islem:'sonuc', id:v.id, ok:false, hata:{mesaj:String(e)} }, '*')); } });
</script></body>`); });
await new Promise((r) => top.listen(0, '127.0.0.1', r));
const topUrl = `http://127.0.0.1:${top.address().port}/`;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const R = {}; let fail = 0;
const check = (k, ok, info = '') => { R[k] = ok ? 'OK' : 'FAIL ' + info; if (!ok) fail++; };
const fake = (addr, onlyTop) => `(() => { if (${onlyTop} && window !== window.top) return; window.__calls = 0;
  window.nimiq = { listAccounts: async () => { window.__calls++; return [${JSON.stringify(addr)}]; } }; })();`;
try {
  for (const [mode, url, onlyTop] of [['direct', app, false], ['bridge', topUrl, true]]) {
    const addr = Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR' });
    await ctx.addInitScript(fake(addr, onlyTop));
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (process.env.DBG) console.log('[' + mode + ']', m.type(), m.text().slice(0, 200)); });
    await p.goto(url);
    const f = () => p.frames().find((x) => x.url().startsWith(app)) || p.mainFrame();
    let inGame = false;
    for (let i = 0; i < 40 && !inGame; i++) { await p.waitForTimeout(250); inGame = await f().isVisible('#bottom').catch(() => false); }
    const lb = await (await fetch(process.env.VITE_API + '/api/leaderboard')).json().catch(() => ({}));
    const acc = await f().evaluate(() => document.querySelector('#accAddr')?.textContent || '').catch(() => '');
    const frameHasWallet = mode === 'bridge' ? await f().evaluate(() => !!window.nimiq) : true;
    if (process.env.DBG) console.log(mode, await f().evaluate(() => ({ useN: !document.querySelector('#useNimiq').classList.contains('hidden'), addr: document.querySelector('#addr').value, err: document.querySelector('#loginErr').textContent })).catch((e) => String(e)));
    check(mode + ':signedInByItself', inGame, 'not in game');
    check(mode + ':walletAddressUsed', acc === addr, acc + ' vs ' + addr);
    if (mode === 'bridge') check('bridge:frameHasNoProvider', frameHasWallet === false);
    check(mode + ':noErrors', errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(topUrl); await p.waitForTimeout(5000);
  const f = p.frames().find((x) => x.url().startsWith(app));
  check('plainBrowser:formShown', await f.isVisible('#loginBtn') && !(await f.isVisible('#useNimiq')));
  check('plainBrowser:noErrors', errs.length === 0, errs.join('|'));
  await ctx.close();
} finally { await browser.close(); await vite.close(); top.close(); game.stopAll(); game.close(); }
console.log(JSON.stringify(R, null, 1));
process.exit(fail ? 1 : 0);

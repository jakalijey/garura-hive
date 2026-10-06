import { createServer as createViteServer } from 'vite';
import * as Nimiq from '@nimiq/core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createGameServer } from '../../server/server.mjs';

const CHROME = process.env.CHROME || undefined
const PW = process.env.PLAYWRIGHT || 'playwright-core';
const OUT = process.env.OUT || '.';
const { chromium } = await import(PW);
let offset = 0;
const game = createGameServer({ dataDir: mkdtempSync(join(tmpdir(), 'hive-rank-')), humanEvery: 1e9, minTapGapMs: 0, autoPayouts: false,
  uraClaimedTotal: async () => 0, uraLinks: async () => [], payout: { enabled: false, send: async () => 'x' }, now: () => Date.now() + offset });
await new Promise((r) => game.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${game.address().port}`;
process.env.VITE_API = API;
const post = (p, b) => fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json());
const tapN = async (token, n) => { for (let i = 0; i < n; i++) await post('/api/tap', { token }); };
const NAMES = ['BalAvcisi', 'Petekci', 'honeyhunter', 'KovanBeyi', 'nimqueen', 'Arıcık', 'GoldenDrop', 'Kehribar', 'buzzbuzz', 'Polen', 'SunsetBee', 'Nektar',
  'hexmaster', 'Kovancı', 'tapfast', 'Damla', 'beekeeper', 'Çiçek', 'waxwing', 'Ballı', 'drone42', 'Mumcu', 'Yaban', 'Lavanta'];
const players = [];
for (const [i, name] of NAMES.entries()) {
  const address = Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress();
  const s = await post('/api/session', { address, name }); players.push({ address, name });
  await tapN(s.token, 900 - i * 30);
}
offset += 86_400_000;
for (const [i, p] of players.slice(0, 8).entries()) { const s = await post('/api/session', p); await tapN(s.token, 260 - i * 30); }
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const vite = await createViteServer({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [w, h, tag] of [[390, 844, 'phone'], [1366, 768, 'desktop']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'tr-TR' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url); await p.waitForTimeout(1000);
    await p.fill('#addr', Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress()); await p.fill('#name', tag === 'phone' ? 'You' : 'You2').catch(() => {});
    await p.click('#loginBtn'); await p.waitForSelector('#bottom:not(.hidden)');
    const token = await p.evaluate(() => localStorage.getItem('hive_token'));
    await tapN(token, tag === 'phone' ? 175 : 0);
    await p.click('#rankBtn'); await p.waitForTimeout(800);
    await p.screenshot({ path: join(OUT, `sira-bugun-${tag}.png`) });
    await p.click('#rkAll'); await p.waitForTimeout(800);
    await p.screenshot({ path: join(OUT, `sira-tum-${tag}.png`) });
    console.log(tag, 'me:', await p.textContent('#rkMe'), '| errors', errs.length, errs.join('|'));
    await ctx.close();
  }
} finally { await browser.close(); await vite.close(); game.stopAll(); game.close(); }

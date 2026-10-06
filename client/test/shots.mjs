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
const EVM = '0x1111111111111111111111111111111111111111';
let claimed = 0, offset = 0;
const game = createGameServer({ dataDir: mkdtempSync(join(tmpdir(), 'hive-shot-')), humanEvery: 1e9, minTapGapMs: 0, autoPayouts: false,
  testAddresses: '', uraClaimedTotal: async () => claimed, uraLinks: async () => [EVM], payout: { enabled: false, send: async () => 'x' }, now: () => Date.now() + offset });
await new Promise((r) => game.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${game.address().port}`;
process.env.VITE_API = API;
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const vite = await createViteServer({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const post = (p, b) => fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json());
try {
  for (const [w, h, tag] of [[390, 844, 'phone'], [1366, 768, 'desktop']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'tr-TR' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const addr = Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress();
    claimed = 0;
    await p.goto(url); await p.waitForTimeout(1000);
    await p.fill('#addr', addr); await p.fill('#name', 'Player').catch(() => {}); await p.click('#loginBtn');
    await p.waitForSelector('#bottom:not(.hidden)'); await p.waitForTimeout(500);
    claimed = 2_000; offset += 61_000;
    await p.reload(); await p.waitForTimeout(1500);
    const token = await p.evaluate(() => localStorage.getItem('hive_token'));
    for (let i = 0; i < 1900; i++) { const r = await post('/api/tap', { token }); if (r.reason === 'ceiling') break; }
    await p.reload(); await p.waitForTimeout(2500);
    const box = await p.locator('#pixi canvas').boundingBox();
    await p.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.3); await p.mouse.down();
    for (let i = 0; i < 30; i++) { await p.mouse.move(box.x + box.width * (0.72 - i * 0.004), box.y + box.height * (0.3 + i * 0.003)); await p.waitForTimeout(60); }
    await p.screenshot({ path: join(OUT, `tasarimC-${tag}.png`) });
    await p.mouse.up();
    if (tag === 'phone') { await p.waitForTimeout(2500); await p.screenshot({ path: join(OUT, 'tasarimC-yaprak.png'), clip: { x: 0, y: 40, width: 160, height: 200 } }); }
    const ds = await p.evaluate(() => ({ ...document.querySelector('#pixi').dataset, btn: document.querySelector('#wdBtn').textContent }));
    console.log(tag, JSON.stringify(ds), 'errors', errs.length, errs.join('|'));
    if (tag === 'phone') { await p.click('#howBtn'); await p.waitForTimeout(500); await p.screenshot({ path: join(OUT, 'tasarimC-nasil.png') }); }
    await ctx.close();
  }
} finally { await browser.close(); await vite.close(); game.stopAll(); game.close(); }

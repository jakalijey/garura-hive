import { createServer as createViteServer } from 'vite';
import * as Nimiq from '@nimiq/core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createGameServer } from '../../server/server.mjs';

const CHROME = process.env.CHROME || undefined;
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright-core');
const OUT = process.env.OUT || '.';
const EVM = '0x1111111111111111111111111111111111111111';
let claimed = 0, offset = 0;
const game = createGameServer({ dataDir: mkdtempSync(join(tmpdir(), 'hive-sub-')), humanEvery: 1e9, minTapGapMs: 0, autoPayouts: false,
  uraClaimedTotal: async () => claimed, uraLinks: async () => [EVM], payout: { enabled: true, send: async () => 'tx' }, now: () => Date.now() + offset });
await new Promise((r) => game.listen(0, '127.0.0.1', r));
process.env.VITE_API = `http://127.0.0.1:${game.address().port}`;
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const vite = await createViteServer({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1080 / 390, locale: 'en-US', hasTouch: true };
const shot = (p, name) => p.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 90 });
const post = (p, b) => fetch(process.env.VITE_API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json());
try {
  let ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(() => { window.nimiq = { listAccounts: () => new Promise(() => {}) }; });
  let p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(2500); await shot(p, '1-connect.jpg'); await ctx.close();
  const addr = Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress();
  ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript((a) => { window.nimiq = { listAccounts: async () => [a] }; try { localStorage.setItem('hive_name', 'Garura'); localStorage.setItem('hive_nameAsked', '1'); } catch {} }, addr);
  p = await ctx.newPage(); await p.goto(url); await p.waitForSelector('#bottom:not(.hidden)');
  claimed = 2000; offset += 61_000;
  const token = await p.evaluate(() => localStorage.getItem('hive_token'));
  for (let i = 0; i < 2300; i++) await post('/api/tap', { token });
  await game.runPayouts();
  for (let i = 0; i < 250; i++) await post('/api/tap', { token });
  await p.reload(); await p.waitForTimeout(2500);
  const box = await p.locator('#pixi canvas').boundingBox();
  for (let i = 0; i < 6; i++) { await p.mouse.click(box.x + box.width * (0.35 + i * 0.06), box.y + box.height * 0.33); await p.waitForTimeout(90); }
  await p.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.28); await p.mouse.down();
  for (let i = 0; i < 25; i++) { await p.mouse.move(box.x + box.width * (0.7 - i * 0.004), box.y + box.height * (0.28 + i * 0.003)); await p.waitForTimeout(60); }
  await shot(p, '2-play.jpg'); await p.mouse.up();
  await p.click('#howBtn'); await p.waitForTimeout(700); await shot(p, '3-how-to-play.jpg'); await p.goBack(); await p.waitForTimeout(300);
  await p.click('#setBtn'); await p.waitForTimeout(500); await shot(p, '4-settings.jpg');
  await ctx.close();
} finally { await browser.close(); await vite.close(); game.stopAll(); game.close(); }

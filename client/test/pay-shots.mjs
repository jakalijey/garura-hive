import { createServer as createViteServer } from 'vite';
import * as Nimiq from '@nimiq/core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createGameServer } from '../../server/server.mjs';

const CHROME = process.env.CHROME || undefined;
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright-core');
const OUT = process.env.OUT || '.';
const game = createGameServer({ dataDir: mkdtempSync(join(tmpdir(), 'hive-pay-')), humanEvery: 1e9, minTapGapMs: 0, autoPayouts: false,
  uraClaimedTotal: async () => 0, uraLinks: async () => [], payout: { enabled: true, send: async () => 'tx' } });
await new Promise((r) => game.listen(0, '127.0.0.1', r));
process.env.VITE_API = `http://127.0.0.1:${game.address().port}`;
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const vite = await createViteServer({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US' });
  await ctx.addInitScript(() => { window.nimiq = { listAccounts: () => new Promise(() => {}) }; });
  let p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(2500);
  await p.screenshot({ path: join(OUT, 'pay-login.png') }); await ctx.close();
  const addr = Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress();
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US' });
  await ctx.addInitScript((a) => { window.nimiq = { listAccounts: async () => [a] }; try { localStorage.setItem('hive_name', 'Bee'); } catch {} }, addr);
  p = await ctx.newPage(); await p.goto(url); await p.waitForSelector('#bottom:not(.hidden)');
  const token = await p.evaluate(() => localStorage.getItem('hive_token'));
  const tap = () => fetch(process.env.VITE_API + '/api/tap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  for (let i = 0; i < 300; i++) await tap();
  await game.runPayouts();
  for (let i = 0; i < 180; i++) await tap();
  await p.reload(); await p.waitForTimeout(2500);
  await p.screenshot({ path: join(OUT, 'pay-game.png') });
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'tr-TR' });
  await ctx.addInitScript((a) => { window.nimiq = { listAccounts: async () => [a] }; }, Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress());
  p = await ctx.newPage(); await p.goto(url); await p.waitForSelector('#sheetName.on', { timeout: 10000 }); await p.waitForTimeout(500);
  await p.screenshot({ path: join(OUT, 'pay-name.png') });
  await ctx.close();
} finally { await browser.close(); await vite.close(); game.stopAll(); game.close(); }

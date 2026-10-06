import { createServer as createViteServer } from 'vite';
import * as Nimiq from '@nimiq/core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createGameServer } from '../../server/server.mjs';
import { DEFAULTS } from '../../server/economy.mjs';
const CHROME = process.env.CHROME || undefined
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright-core');
const OUT = process.env.OUT || '.';
const game = createGameServer({ dataDir: mkdtempSync(join(tmpdir(), 'hive-jar-')), cfg: { ...DEFAULTS, FILL_TAPS: 20, MAX_DAILY_NIM: 20, BASE_DAILY_NIM: 3 }, humanEvery: 1e9, minTapGapMs: 0, autoPayouts: false,
  uraClaimedTotal: async () => 0, uraLinks: async () => [], payout: { enabled: false, send: async () => 'x' } });
await new Promise((r) => game.listen(0, '127.0.0.1', r));
process.env.VITE_API = `http://127.0.0.1:${game.address().port}`;
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const vite = await createViteServer({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' }); await vite.listen();
const b = await chromium.launch({ executablePath: CHROME, args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=user-gesture-required'] });
const R = {};
try {
  const p = await b.newPage({ viewport: { width: 412, height: 760 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`); await p.waitForTimeout(1200);
  await p.fill('#addr', Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress()); await p.click('#loginBtn'); await p.waitForSelector('#bottom:not(.hidden)');
  const box = await p.locator('#pixi canvas').boundingBox();
  const at = async (fx, fy) => { await p.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await p.waitForTimeout(250); return p.getAttribute('#pixi', 'data-last-drop'); };
  const d1 = await at(0.3, 0.3), d2 = await at(0.7, 0.45);
  R.dropsFollowTap = d1 && d2 && d1 !== d2 ? `OK (${d1} -> ${d2})` : `FAIL ${d1} ${d2}`;
  R.audioRunning = (await p.getAttribute('html', 'data-audio')) === 'running' ? 'OK' : 'FAIL ' + await p.getAttribute('html', 'data-audio');
  for (let i = 0; i < 12; i++) await at(0.5, 0.35);
  await p.waitForTimeout(1500);
  R.jarToShelf = Number(await p.getAttribute('#pixi', 'data-full-jars')) >= 1 ? 'OK (' + await p.getAttribute('#pixi', 'data-full-jars') + ' full)' : 'FAIL';
  R.noErrors = errs.length ? 'FAIL ' + errs.join('|') : 'OK';
  await p.screenshot({ path: join(OUT, 'jar-shelf.png') });
} finally { await b.close(); await vite.close(); game.stopAll(); game.close(); }
console.log(JSON.stringify(R, null, 1));

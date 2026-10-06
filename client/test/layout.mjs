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

const game = createGameServer({ dataDir: mkdtempSync(join(tmpdir(), 'hive-lay-')), humanEvery: 1e9, minTapGapMs: 0, autoPayouts: false,
  uraClaimedTotal: async () => 0, uraLinks: async () => [], payout: { enabled: false, send: async () => 'x' } });
await new Promise((r) => game.listen(0, '127.0.0.1', r));
process.env.VITE_API = `http://127.0.0.1:${game.address().port}`;
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const vite = await createViteServer({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = process.env.SIZES ? JSON.parse(process.env.SIZES) : [[360, 640], [412, 760], [390, 844], [430, 932], [1366, 768], [1920, 950], [1920, 1080]];
let fail = 0;
try {
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'tr-TR' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url); await p.waitForTimeout(1200);
    await p.fill('#addr', Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress()); await p.click('#loginBtn');
    await p.waitForSelector('#bottom:not(.hidden)'); await p.waitForTimeout(400);
    const box = await p.locator('#pixi canvas').boundingBox();
    for (let i = 0; i < 25; i++) { await p.mouse.click(box.x + box.width / 2, box.y + box.height * 0.4); await p.waitForTimeout(40); }
    await p.waitForTimeout(1800);
    const m = await p.evaluate(() => {
      const h1 = document.querySelector('header h1').getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(document.querySelector('header h1')).lineHeight) || 24;
      const bottomTop = document.querySelector('#bottom').getBoundingClientRect().top;
      const stage = document.querySelector('#stage').getBoundingClientRect();
      const hud = document.querySelector('#hud').getBoundingClientRect();
      const header = document.querySelector('header').getBoundingClientRect();
      const px = document.querySelector('#pixi'); const cv = px.querySelector('canvas').getBoundingClientRect();
      return { titleLines: Math.round(h1.height / lh), headerFits: header.right <= window.innerWidth + 1, stageBottom: stage.bottom, bottomTop, hudBottom: hud.bottom,
               canvasMatches: Math.abs(cv.height - stage.height) <= 2, jarInside: Number(px.dataset.jarBottom) <= stage.height - 4, cvH: Math.round(cv.height), stH: Math.round(stage.height), jarB: px.dataset.jarBottom, sceneH: px.dataset.sceneH };
    });
    const ok = m.titleLines === 1 && m.headerFits && m.stageBottom <= m.bottomTop + 1 && m.canvasMatches && m.jarInside && errs.length === 0;
    if (!ok) fail++;
    console.log(`${w}x${h}: ${ok ? 'OK' : 'FAIL'}  cvH=${m.cvH} stH=${m.stH} jarB=${m.jarB} sceneH=${m.sceneH} canvas=${m.canvasMatches} jarInside=${m.jarInside} titleLines=${m.titleLines} headerFits=${m.headerFits} stageBottom=${Math.round(m.stageBottom)} bottomTop=${Math.round(m.bottomTop)} errors=${errs.length}`);
    await p.screenshot({ path: join(OUT, `layout-${w}x${h}.png`) });
    await ctx.close();
  }
} finally { await browser.close(); await vite.close(); game.stopAll(); game.close(); }
process.exit(fail ? 1 : 0);

import { createServer as createViteServer } from 'vite';
import * as Nimiq from '@nimiq/core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createGameServer } from '../../server/server.mjs';
import { DEFAULTS } from '../../server/economy.mjs';

const CHROME = process.env.CHROME || undefined
const PW = process.env.PLAYWRIGHT || 'playwright-core';
const OUT = process.env.OUT || '.';
const { chromium } = await import(PW);

const addr = Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress();
const EVM = '0x2222222222222222222222222222222222222222';
const ura = { [EVM]: 0 }, sent = [];
const game = createGameServer({
  dataDir: mkdtempSync(join(tmpdir(), 'hive-e2e-')), cfg: { ...DEFAULTS, FILL_TAPS: 100 }, humanEvery: 5, minTapGapMs: 30, autoPayouts: false, autoSweep: false,
  uraClaimedTotal: async (a) => ura[a.toLowerCase()] ?? 0,
  uraLinks: async (a) => (a === addr ? [EVM] : []),
  payout: { enabled: true, address: 'NQ00', send: async (to, luna) => { sent.push({ to, luna }); return 'tx1'; } },
});
await new Promise((r) => game.listen(0, '127.0.0.1', r));
process.env.VITE_API = `http://127.0.0.1:${game.address().port}`;
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const vite = await createViteServer({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const pageUrl = `http://127.0.0.1:${vite.httpServer.address().port}/`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const R = {}; const fail = [];
const check = (k, cond, info) => { R[k] = cond ? 'OK' : 'FAIL ' + (info ?? ''); if (!cond) fail.push(k); };
try {
  const ctx0 = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: 'tr-TR' });
  const p0 = await ctx0.newPage(); await p0.goto(pageUrl); await p0.waitForTimeout(1500);
  await p0.fill('#addr', 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000'); await p0.click('#loginBtn'); await p0.waitForTimeout(500);
  check('wrongAddressRejected', /geçerli/.test(await p0.textContent('#loginErr')), await p0.textContent('#loginErr'));
  await ctx0.close();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((a) => { window.nimiqPay = { language: 'tr' }; window.nimiq = { listAccounts: async () => [a] }; try { localStorage.setItem('hive_name', 'Ari'); } catch {} }, addr);
  await page.goto(pageUrl);
  await page.waitForSelector('#bottom:not(.hidden)', { timeout: 10000 });
  check('nimiqAutoSignIn', (await page.inputValue('#addr')) === addr, await page.inputValue('#addr'));
  check('signedIn', true);

  const canvas = await page.locator('#pixi canvas').boundingBox();
  const tapAt = async () => { await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.33); await page.waitForTimeout(110); };
  for (let i = 0; i < 5; i++) await tapAt();
  await page.waitForTimeout(900);
  check('honeyAfter5', (await page.textContent('#jar')) === '0.05', await page.textContent('#jar'));
  await tapAt();
  await page.waitForSelector('#q[style*="flex"]', { timeout: 5000 });
  const [a, b] = (await page.getAttribute('#ans', 'placeholder')).match(/\d+/g).map(Number);
  await page.fill('#ans', String(a + b)); await page.click('#ansBtn'); await page.waitForTimeout(900);
  check('afterQuestion', (await page.textContent('#jar')) === '0.06', await page.textContent('#jar'));


  await page.click('#rankBtn'); await page.waitForTimeout(500);
  const rankOpen = await page.locator('#sheetRank.on').count();
  const rankText = await page.textContent('#lb');
  await page.goBack(); await page.waitForTimeout(300);
  check('rankingShowsPlayer', /Ari/.test(rankText), rankText);
  check('backClosesSheet', rankOpen === 1 && (await page.locator('#sheetRank.on').count()) === 0);
  check('backKeepsGame', await page.isVisible('#bottom'));

  const token = await page.evaluate(() => { try { return localStorage.getItem('hive_token'); } catch { return null; } });
  for (let i = 0; i < 400; i++) {
    await new Promise((z) => setTimeout(z, 35));
    const r = await fetch(process.env.VITE_API + '/api/tap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }).then((x) => x.json());
    if (r.question) { const [x, y] = r.question.match(/\d+/g).map(Number); await fetch(process.env.VITE_API + '/api/tap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, answer: x + y }) }); }
    if (r.reason === 'ceiling') break;
  }
  await page.reload(); await page.waitForTimeout(2500);
  check('jarReadyAfterReload', !(await page.isDisabled('#wdBtn')), await page.textContent('#wdBtn'));
  await page.click('#wdBtn'); await page.waitForTimeout(1200);
  check('queuedShown', /ödeme sırasında/.test(await page.textContent('#wdBtn small')), await page.textContent('#wdBtn'));
  check('leafVisible', await page.isVisible('#leaf'));
  await page.click('#howBtn'); await page.waitForTimeout(400);
  check('howItems', (await page.locator('#howList .it').count()) === 6, String(await page.locator('#howList .it').count()));
  check('howLinks', (await page.locator('#sheetHow a[href="https://x.com/heylogramtv"]').count()) === 1 && (await page.locator('#sheetHow a[href="mailto:garurahive@heylogram.com"]').count()) === 1);
  check('noTelegram', (await page.locator('a[href*="t.me"]').count()) === 0);
  await page.screenshot({ path: join(OUT, 'hive-how.png') });
  await page.goBack(); await page.waitForTimeout(300);
  await game.runPayouts();
  check('batchPaidToAddress', sent.length === 1 && sent[0].to === addr, JSON.stringify(sent, (k, v) => typeof v === 'bigint' ? v.toString() : v));

  await page.click('#setBtn'); await page.waitForTimeout(300);
  check('settingsOpen', (await page.locator('#sheetSet.on').count()) === 1);
  check('accountInSettings', (await page.textContent('#accAddr')) === addr, await page.textContent('#accAddr'));
  await page.click('#langBtn'); await page.waitForTimeout(200);
  await page.click('#optSound'); await page.waitForTimeout(100);
  const soundSaved = await page.evaluate(() => { try { return localStorage.getItem('hive_sound'); } catch { return null; } });
  await page.goBack(); await page.waitForTimeout(300);
  check('backClosesSettings', (await page.locator('#sheetSet.on').count()) === 0);
  check('soundOffRemembered', soundSaved === '0', soundSaved);
  check('englishLabels', (await page.textContent('#rankBtn')) === 'Ranking', await page.textContent('#rankBtn'));
  check('noPageErrors', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: join(OUT, 'hive-e2e.png') });
  await ctx.close();
} finally { await browser.close(); await vite.close(); game.stopAll(); game.close(); }
console.log(JSON.stringify(R, null, 1));
process.exit(fail.length ? 1 : 0);

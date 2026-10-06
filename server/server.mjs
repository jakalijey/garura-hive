import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import * as E from './economy.mjs';
import { parseNimiqAddress, nimiqKey } from './identity.mjs';
import { uraClaimedTotal as uraClaimedTotalLive } from './ura.mjs';
import { createPayout } from './payout.mjs';

const DAY_MS = 86_400_000;
const today = (now = Date.now()) => Math.floor(now / DAY_MS);
const URA_API = process.env.URA_API || 'https://signal.heylogram.tv/uraapi';

async function uraLinksLive(nimiqAddress) {
  const r = await fetch(`${URA_API}/api/ura/nimiq-link?nimiq=${encodeURIComponent(nimiqAddress)}`, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error('ura ' + r.status);
  const j = await r.json();
  return Array.isArray(j.wallets) ? j.wallets.filter((w) => /^0x[0-9a-fA-F]{40}$/.test(w)).slice(0, 5) : [];
}

const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);

export function createServer({
  dataDir = process.env.DATA_DIR || './data',
  cfg = E.DEFAULTS,
  payout = createPayout({ privateKeyHex: process.env.PAYOUT_PRIVATE_KEY, network: process.env.NIMIQ_NETWORK || 'MainAlbatross' }),
  uraClaimedTotal = uraClaimedTotalLive,
  uraLinks = uraLinksLive,
  now = () => Date.now(),
  humanEvery = 300,
  minTapGapMs = 60,
  payoutEveryMs = Number(process.env.PAYOUT_EVERY_MS || 3_600_000),
  autoPayouts = true,
  autoSweep = process.env.AUTO_PAYOUT !== '0',
  autoMinNim = Number(process.env.AUTO_MIN_NIM || 0.01),
  testAddresses = process.env.TEST_ADDRESSES || '',
} = {}) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'state.json');
  const state = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'), (k, v) => (typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v))
    : { players: {}, budget: { day: 0, spent: 0n }, payouts: [], devices: {}, lastBatch: 0 };
  state.devices ||= {}; state.payouts ||= []; state.lastBatch ||= 0;
  if (!state.lastBatch) state.lastBatch = now() - payoutEveryMs + 5 * 60_000;
  const testSet = new Set(String(testAddresses).split(',').map((a) => nimiqKey(a)).filter(Boolean));
  const minFor = (nq) => (testSet.has(nq) ? { ...cfg, MIN_WITHDRAW_NIM: 0.01 } : cfg);
  let dirty = false;
  for (const r of state.payouts) if (r.status === 'sending') { r.status = 'check_manually'; dirty = true; }
  for (const p of Object.values(state.players)) if (p.sending) { p.sending = false; dirty = true; }
  const save = () => {
    if (!dirty) return;
    const tmp = file + '.tmp';
    writeFileSync(tmp, JSON.stringify(state, (k, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v)));
    renameSync(tmp, file); dirty = false;
  };
  const saver = setInterval(save, 3_000); saver.unref?.();

  const sessions = new Map();
  const ipNew = new Map();
  const uraCache = new Map();
  const linkCache = new Map();

  function player(nq) {
    const d = today(now());
    let p = state.players[nq];
    if (!p) p = state.players[nq] = { addr: null, name: '', jar: 0n, queued: 0n, earnedToday: 0n, total: 0n, day: d, taps: 0, paid: 0n, snaps: {}, lastTap: 0, sinceHuman: 0, question: null, cachedClaimed: 0 };
    if (p.day !== d) { p.day = d; p.earnedToday = 0n; }
    p.snaps ||= {};
    return p;
  }
  function budgetLeft() {
    const d = today(now());
    if (state.budget.day !== d) { state.budget = { day: d, spent: 0n }; dirty = true; }
    return E.dailyBudget(cfg) - state.budget.spent;
  }

  async function links(nq, addr) {
    const c = linkCache.get(nq);
    if (c && now() - c.t < 60_000) return c.wallets;
    const wallets = await uraLinks(addr);
    linkCache.set(nq, { t: now(), wallets });
    return wallets;
  }
  async function uraTotal(evm, fresh = false) {
    const k = evm.toLowerCase(); const c = uraCache.get(k);
    if (c && !fresh && now() - c.t < 60_000) return c.total;
    const total = await uraClaimedTotal(evm);
    uraCache.set(k, { t: now(), total });
    return total;
  }
  async function claimedToday(nq, p) {
    try {
      const d = today(now());
      let sum = 0;
      for (const w of await links(nq, p.addr)) {
        const k = w.toLowerCase();
        const total = await uraTotal(k);
        if (!p.snaps[k] || p.snaps[k].day !== d) { p.snaps[k] = { day: d, total }; dirty = true; }
        sum += E.uraClaimedToday(total, p.snaps[k].total);
      }
      p.cachedClaimed = sum;
      return sum;
    } catch { return p.cachedClaimed || 0; }
  }
  let snapDay = today(now());
  const snapper = setInterval(async () => {
    const d = today(now()); if (d === snapDay) return; snapDay = d;
    for (const [nq, p] of Object.entries(state.players)) {
      try {
        for (const w of await links(nq, p.addr)) { const k = w.toLowerCase(); p.snaps[k] = { day: d, total: await uraTotal(k, true) }; dirty = true; }
      } catch {}
    }
  }, 60_000); snapper.unref?.();

  let batchRunning = false;
  async function runPayouts() {
    if (batchRunning || !payout.enabled) return { sent: 0 };
    batchRunning = true; let sent = 0;
    try {
      if (autoSweep) {
        const min = E.nimToLuna(autoMinNim);
        for (const p of Object.values(state.players)) if (p.auto && p.addr && !p.sending && p.jar >= min) { p.queued += p.jar; p.jar = 0n; dirty = true; }
      }
      for (const [nq, p] of Object.entries(state.players)) {
        if (p.queued <= 0n || !p.addr) continue;
        const amount = p.queued;
        const rec = { id: randomBytes(8).toString('hex'), nq, luna: amount, at: now(), status: 'sending', tx: null };
        state.payouts.push(rec); p.sending = true; dirty = true; save();
        try {
          rec.tx = await payout.send(p.addr, amount);
          rec.status = 'sent'; p.queued -= amount; p.paid += amount; sent++;
        } catch (e) {
          rec.status = 'failed'; rec.error = String(e?.message || e).slice(0, 200);
        } finally { p.sending = false; dirty = true; save(); }
      }
      state.lastBatch = now(); dirty = true;
    } finally { batchRunning = false; }
    return { sent };
  }
  const nextBatchAt = () => (state.lastBatch || now()) + payoutEveryMs;
  const batcher = autoPayouts ? setInterval(() => { if (now() >= nextBatchAt()) runPayouts().catch(() => {}); }, 30_000) : null;
  batcher?.unref?.();

  function auth(token) {
    const s = token && sessions.get(token);
    if (!s || s.expires < now()) return null;
    return s;
  }

  async function view(nq) {
    const p = player(nq);
    const claimed = await claimedToday(nq, p);
    const ceiling = E.dailyCeiling(claimed, cfg);
    return {
      address: p.addr, name: p.name,
      jar: E.formatNim(p.jar), jarLuna: p.jar.toString(),
      queued: E.formatNim(p.queued), nextBatchAt: p.queued > 0n || (autoSweep && p.auto) ? nextBatchAt() : null,
      autoPayout: autoSweep && !!p.auto, autoMin: String(autoMinNim),
      earnedToday: E.formatNim(p.earnedToday),
      ceilingToday: E.formatNim(ceiling),
      honeyPerTap: E.formatNim(E.honeyPerTap(ceiling, cfg)),
      uraClaimedToday: claimed,
      canWithdraw: E.canWithdraw(p.jar, minFor(nq)),
      minWithdraw: String(minFor(nq).MIN_WITHDRAW_NIM),
      paidTotal: E.formatNim(p.paid),
      totalHoney: E.formatNim(p.total),
      budgetLeftToday: E.formatNim(budgetLeft() > 0n ? budgetLeft() : 0n),
      payoutsEnabled: payout.enabled,
    };
  }

  async function handle(req, res, url, body) {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const path = url.pathname;
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');

    if (path === '/api/health') return send(200, { ok: true, players: Object.keys(state.players).length, payouts: payout.enabled });

    if (path === '/api/session' && req.method === 'POST') {
      const addr = parseNimiqAddress(body.address);
      if (!addr) return send(400, { error: 'bad_address' });
      const name = cleanName(body.name);
      const w = ipNew.get(ip) || { n: 0, since: now() };
      if (now() - w.since > 3_600_000) { w.n = 0; w.since = now(); }
      if (++w.n > 20) return send(429, { error: 'too_many_sessions' });
      ipNew.set(ip, w);
      const nq = nimiqKey(addr);
      if (typeof body.device === 'string' && /^[0-9a-f]{64}$/.test(body.device)) {
        const list = state.devices[body.device] || [];
        if (!list.includes(nq)) {
          if (list.length >= 2) return send(403, { error: 'device_limit' });
          state.devices[body.device] = [...list, nq]; dirty = true;
        }
      }
      const p = player(nq);
      p.addr = addr; if (name) p.name = name; dirty = true;
      p.auto = body.auto === true;
      const token = randomBytes(24).toString('hex');
      sessions.set(token, { nq, expires: now() + DAY_MS });
      return send(200, { token, address: addr, name: p.name });
    }

    if (path === '/api/me' && req.method === 'GET') {
      const s = auth(url.searchParams.get('token')); if (!s) return send(401, { error: 'session_required' });
      return send(200, await view(s.nq));
    }

    if (path === '/api/leaderboard' && req.method === 'GET') {
      const scope = url.searchParams.get('scope') === 'today' ? 'today' : 'all', d = today(now());
      const val = (p) => (scope === 'today' ? (p.day === d ? p.earnedToday : 0n) : p.total);
      const ranked = Object.values(state.players).filter((p) => val(p) > 0n).sort((a, b) => (val(b) > val(a) ? 1 : val(b) < val(a) ? -1 : 0));
      const s = auth(url.searchParams.get('token'));
      const row = (p, i) => ({ pos: i + 1, name: p.name || (p.addr ? p.addr.slice(0, 9) + '…' : '?'), honey: E.formatNim(val(p)), ...(s && p.addr && nimiqKey(p.addr) === s.nq ? { you: true } : {}) });
      const top = ranked.slice(0, 20).map(row);
      let me = null;
      if (s) { const i = ranked.findIndex((p) => p.addr && nimiqKey(p.addr) === s.nq); me = i >= 0 ? row(ranked[i], i) : { pos: null, honey: '0' }; }
      return send(200, { scope, top, me, players: ranked.length });
    }

    if (path === '/api/tap' && req.method === 'POST') {
      const s = auth(body.token); if (!s) return send(401, { error: 'session_required' });
      const p = player(s.nq);
      if (p.question) {
        if (Number(body.answer) !== p.question.answer) return send(200, { question: p.question.text });
        p.question = null; p.sinceHuman = 0;
      }
      const t = now();
      if (t - p.lastTap < minTapGapMs) return send(429, { error: 'too_fast' });
      p.lastTap = t;
      if (p.sinceHuman >= humanEvery) {
        const a = randomInt(2, 10), b = randomInt(2, 10);
        p.question = { text: `${a} + ${b} = ?`, answer: a + b };
        dirty = true;
        return send(200, { question: p.question.text });
      }
      const ceiling = E.dailyCeiling(p.cachedClaimed || 0, cfg);
      const r = E.applyTap(p, ceiling, budgetLeft(), cfg);
      p.taps++; p.sinceHuman++;
      if (r.gained > 0n) { p.earnedToday += r.gained; p.jar += r.gained; p.total += r.gained; state.budget.spent += r.gained; }
      dirty = true;
      claimedToday(s.nq, p).catch(() => {});
      return send(200, { ok: true, gained: E.formatNim(r.gained), jar: E.formatNim(p.jar), reason: r.reason });
    }

    if (path === '/api/name' && req.method === 'POST') {
      const s = auth(body.token); if (!s) return send(401, { error: 'session_required' });
      const name = cleanName(body.name);
      if (!name) return send(400, { error: 'empty_name' });
      const p = player(s.nq); p.name = name; dirty = true; save();
      return send(200, { ok: true, name });
    }

    if (path === '/api/withdraw' && req.method === 'POST') {
      const s = auth(body.token); if (!s) return send(401, { error: 'session_required' });
      const p = player(s.nq);
      if (!E.canWithdraw(p.jar, minFor(s.nq))) return send(400, { error: 'below_minimum', minimum: String(minFor(s.nq).MIN_WITHDRAW_NIM) });
      p.queued += p.jar; const amount = p.jar; p.jar = 0n; dirty = true; save();
      return send(200, { ok: true, amount: E.formatNim(amount), queued: E.formatNim(p.queued), nextBatchAt: nextBatchAt(), payoutsEnabled: payout.enabled });
    }

    return send(404, { error: 'not_found' });
  }

  const server = http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://x');
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 16_384) req.destroy(); });
    req.on('end', async () => {
      let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch { res.writeHead(400); return res.end('{"error":"bad_json"}'); } }
      try { await handle(req, res, url, body); }
      catch (e) { console.error(e); if (!res.headersSent) { res.writeHead(500); res.end('{"error":"server"}'); } }
    });
  });
  server.stopAll = () => { clearInterval(saver); clearInterval(snapper); if (batcher) clearInterval(batcher); save(); };
  server.state = state;
  server.runPayouts = runPayouts;
  return server;
}

if ((process.argv[1] || '').split(/[\\/]/).pop() === 'server.mjs') {
  const port = Number(process.env.PORT || 8098);
  const s = createServer();
  s.listen(port, process.env.HOST || '127.0.0.1', () => console.log('hive server on', port));
  const stop = () => { s.stopAll(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

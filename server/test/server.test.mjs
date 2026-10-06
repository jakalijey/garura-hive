import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Nimiq from '@nimiq/core';
import { createServer } from '../server.mjs';

const newAddr = () => Nimiq.KeyPair.generate().toAddress().toUserFriendlyAddress();
const EVM = '0x1111111111111111111111111111111111111111';

async function boot({ ura = {}, linksFor = {}, payoutFails = false, humanEvery = 1_000_000, payoutEnabled = true, testAddresses = '' } = {}) {
  let clock = 1_800_000_000_000;
  const sent = [];
  const payout = {
    enabled: payoutEnabled, address: 'NQ00 TEST',
    send: async (to, luna) => { if (payoutFails) throw new Error('network'); sent.push({ to, luna }); return 'tx' + sent.length; },
  };
  const s = createServer({
    dataDir: mkdtempSync(join(tmpdir(), 'hive-')), payout, humanEvery, minTapGapMs: 0, autoPayouts: false, testAddresses,
    uraClaimedTotal: async (evm) => ura[evm.toLowerCase()] ?? 0,
    uraLinks: async (addr) => linksFor[addr] ?? [],
    now: () => clock,
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const api = async (path, body) => {
    const r = await fetch(base + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return { status: r.status, ...(await r.json()) };
  };
  return { s, api, sent, tick: (ms) => { clock += ms; }, close: () => { s.stopAll(); s.close(); } };
}
const tapN = async (api, token, n) => { for (let i = 0; i < n; i++) await api('/api/tap', { token }); };

test('sign in with a Nimiq address (any case/spacing) and a name; a tap earns 0.0001 NIM', async () => {
  const t = await boot();
  try {
    const addr = newAddr();
    const s = await t.api('/api/session', { address: addr.toLowerCase().replace(/ /g, ''), name: 'Bee' });
    assert.equal(s.address, addr); assert.equal(s.name, 'Bee'); assert.ok(s.token);
    assert.equal((await t.api('/api/tap', { token: s.token })).gained, '0.0001');
    const me = await t.api('/api/me?token=' + s.token);
    assert.equal(me.ceilingToday, '1'); assert.equal(me.jar, '0.0001'); assert.equal(me.canWithdraw, false);
  } finally { t.close(); }
});

test('wrong checksum, Polygon address and junk are rejected', async () => {
  const t = await boot();
  try {
    const good = newAddr();
    const bad = good.slice(0, -1) + (good.endsWith('A') ? 'B' : 'A');
    assert.equal((await t.api('/api/session', { address: bad })).error, 'bad_address');
    assert.equal((await t.api('/api/session', { address: EVM })).error, 'bad_address');
    assert.equal((await t.api('/api/session', { address: 'hello' })).error, 'bad_address');
  } finally { t.close(); }
});

test('URA claimed today by a linked Polygon wallet raises the limit: +1,000 URA -> 6 NIM', async () => {
  const addr = newAddr();
  const ura = { [EVM]: 5_000 };
  const t = await boot({ ura, linksFor: { [addr]: [EVM] } });
  try {
    const s = await t.api('/api/session', { address: addr });
    let me = await t.api('/api/me?token=' + s.token);
    assert.equal(me.uraClaimedToday, 0); assert.equal(me.ceilingToday, '1');
    ura[EVM] = 6_000;
    t.tick(61_000);
    me = await t.api('/api/me?token=' + s.token);
    assert.equal(me.uraClaimedToday, 1_000); assert.equal(me.ceilingToday, '6'); assert.equal(me.honeyPerTap, '0.0006');
    assert.equal((await t.api('/api/tap', { token: s.token })).gained, '0.0006');
  } finally { t.close(); }
});

test('an address without URA links gets the base limit only', async () => {
  const t = await boot({ ura: { [EVM]: 99_999 }, linksFor: {} });
  try {
    const s = await t.api('/api/session', { address: newAddr() });
    assert.equal((await t.api('/api/me?token=' + s.token)).ceilingToday, '1');
  } finally { t.close(); }
});

test('human question blocks taps until answered', async () => {
  const t = await boot({ humanEvery: 3 });
  try {
    const s = await t.api('/api/session', { address: newAddr() });
    await tapN(t.api, s.token, 3);
    const q = await t.api('/api/tap', { token: s.token });
    assert.match(q.question, /^\d \+ \d = \?$/);
    const [a, b] = q.question.match(/\d/g).map(Number);
    assert.ok((await t.api('/api/tap', { token: s.token, answer: a + b + 1 })).question);
    assert.equal((await t.api('/api/tap', { token: s.token, answer: a + b })).ok, true);
  } finally { t.close(); }
});

test('withdraw queues the jar; the batch pays it to the player address in one transaction', async () => {
  const t = await boot();
  try {
    const addr = newAddr();
    const s = await t.api('/api/session', { address: addr });
    assert.equal((await t.api('/api/withdraw', { token: s.token })).error, 'below_minimum');
    await tapN(t.api, s.token, 10_000);
    assert.equal((await t.api('/api/tap', { token: s.token })).reason, 'ceiling');
    const w = await t.api('/api/withdraw', { token: s.token });
    assert.equal(w.ok, true); assert.equal(w.amount, '1'); assert.equal(w.queued, '1'); assert.ok(w.nextBatchAt);
    let me = await t.api('/api/me?token=' + s.token);
    assert.equal(me.jar, '0'); assert.equal(me.queued, '1');
    assert.equal(t.sent.length, 0);
    await t.s.runPayouts();
    assert.deepEqual(t.sent, [{ to: addr, luna: 100_000n }]);
    me = await t.api('/api/me?token=' + s.token);
    assert.equal(me.queued, '0'); assert.equal(me.paidTotal, '1');
  } finally { t.close(); }
});

test('a failed batch keeps the honey queued for the next batch', async () => {
  const t = await boot({ payoutFails: true });
  try {
    const s = await t.api('/api/session', { address: newAddr() });
    await tapN(t.api, s.token, 10_000);
    await t.api('/api/withdraw', { token: s.token });
    await t.s.runPayouts();
    const me = await t.api('/api/me?token=' + s.token);
    assert.equal(me.queued, '1'); assert.equal(me.paidTotal, '0');
  } finally { t.close(); }
});

test('two withdrawals before a batch are paid together', async () => {
  const t = await boot();
  try {
    const addr = newAddr();
    const s = await t.api('/api/session', { address: addr });
    await tapN(t.api, s.token, 10_000); await t.api('/api/withdraw', { token: s.token });
    t.tick(86_400_000);
    const s2 = await t.api('/api/session', { address: addr });
    await tapN(t.api, s2.token, 10_000); await t.api('/api/withdraw', { token: s2.token });
    await t.s.runPayouts();
    assert.deepEqual(t.sent, [{ to: addr, luna: 200_000n }]);
  } finally { t.close(); }
});

test('leaderboard ranks by honey collected and shows names', async () => {
  const t = await boot();
  try {
    const a = await t.api('/api/session', { address: newAddr(), name: 'Ari' });
    const b = await t.api('/api/session', { address: newAddr(), name: 'Petek' });
    await tapN(t.api, a.token, 30); await tapN(t.api, b.token, 50);
    const lb = await t.api('/api/leaderboard');
    assert.deepEqual(lb.top.map((x) => x.name), ['Petek', 'Ari']);
    assert.equal(lb.top[0].honey, '0.005');
  } finally { t.close(); }
});

test('a new UTC day resets today\'s earnings but keeps the jar', async () => {
  const t = await boot();
  try {
    const addr = newAddr();
    const s = await t.api('/api/session', { address: addr });
    await tapN(t.api, s.token, 10_000);
    t.tick(86_400_000);
    const s2 = await t.api('/api/session', { address: addr });
    assert.equal((await t.api('/api/tap', { token: s2.token })).gained, '0.0001');
    assert.equal((await t.api('/api/me?token=' + s2.token)).jar, '1.0001');
  } finally { t.close(); }
});

test('test exception: only a listed address may withdraw from 0.01 NIM; others keep 1 NIM', async () => {
  const tester = newAddr(), normal = newAddr();
  const t = await boot({ testAddresses: tester });
  try {
    const a = await t.api('/api/session', { address: tester });
    const b = await t.api('/api/session', { address: normal });
    await tapN(t.api, a.token, 120); await tapN(t.api, b.token, 120);
    assert.equal((await t.api('/api/me?token=' + a.token)).minWithdraw, '0.01');
    assert.equal((await t.api('/api/withdraw', { token: a.token })).ok, true);
    assert.equal((await t.api('/api/withdraw', { token: b.token })).error, 'below_minimum');
    await t.s.runPayouts();
    assert.deepEqual(t.sent.map((x) => x.to), [tester]);
  } finally { t.close(); }
});

test('the first batch is scheduled ~5 minutes after the first start', async () => {
  const t = await boot();
  try {
    const s = await t.api('/api/session', { address: newAddr() });
    await tapN(t.api, s.token, 10_000);
    const w = await t.api('/api/withdraw', { token: s.token });
    const wait = w.nextBatchAt - 1_800_000_000_000;
    assert.ok(wait > 0 && wait <= 5 * 60_000, String(wait));
  } finally { t.close(); }
});

test('leaderboard: today vs all-time, own row marked, own place returned outside the top list', async () => {
  const t = await boot();
  try {
    const a = await t.api('/api/session', { address: newAddr(), name: 'Ari' });
    await tapN(t.api, a.token, 50);
    t.tick(86_400_000);
    const b = await t.api('/api/session', { address: newAddr(), name: 'Petek' });
    const a2 = await t.api('/api/session', { address: a.address });
    await tapN(t.api, b.token, 30); await tapN(t.api, a2.token, 10);
    const all = await t.api('/api/leaderboard?token=' + b.token);
    assert.deepEqual(all.top.map((x) => x.name), ['Ari', 'Petek']);
    assert.equal(all.top[1].you, true); assert.equal(all.top[0].you, undefined);
    assert.deepEqual([all.me.pos, all.me.honey, all.players], [2, '0.003', 2]);
    const day = await t.api('/api/leaderboard?scope=today&token=' + a2.token);
    assert.equal(day.scope, 'today');
    assert.deepEqual(day.top.map((x) => [x.name, x.honey]), [['Petek', '0.003'], ['Ari', '0.001']]);
    assert.equal(day.me.pos, 2);
    const anon = await t.api('/api/leaderboard');
    assert.equal(anon.me, null); assert.ok(anon.top.every((x) => !x.you));
  } finally { t.close(); }
});

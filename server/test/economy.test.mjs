import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, LUNA, dailyCeiling, honeyPerTap, applyTap, canWithdraw, uraClaimedToday, dailyBudget, formatNim,
} from '../economy.mjs';

function tapDay(uraClaimed, taps, budget = dailyBudget()) {
  const ceiling = dailyCeiling(uraClaimed);
  const p = { earnedToday: 0n };
  for (let i = 0; i < taps; i++) {
    const r = applyTap(p, ceiling, budget);
    p.earnedToday += r.gained; budget -= r.gained;
    if (r.reason !== 'ok') break;
  }
  return p.earnedToday;
}

test('no URA claims: a full day of tapping yields about 1 NIM, never more', () => {
  assert.equal(dailyCeiling(0), 1n * LUNA);
  assert.equal(tapDay(0, DEFAULTS.FILL_TAPS), 1n * LUNA);
  assert.equal(tapDay(0, 50_000), 1n * LUNA);
  assert.ok(tapDay(0, 1_000) < 1n * LUNA);
});

test('1,000 URA claimed today raises the ceiling by 5 NIM (design example)', () => {
  assert.equal(dailyCeiling(1_000), 6n * LUNA);
  assert.equal(tapDay(1_000, DEFAULTS.FILL_TAPS), 6n * LUNA);
});

test('ceiling is capped at MAX_DAILY_NIM', () => {
  assert.equal(dailyCeiling(1_000_000), BigInt(DEFAULTS.MAX_DAILY_NIM) * LUNA);
});

test('negative / garbage claims count as zero', () => {
  assert.equal(dailyCeiling(-500), 1n * LUNA);
  assert.equal(dailyCeiling('abc'), 1n * LUNA);
  assert.equal(uraClaimedToday(100, 250), 0);
  assert.equal(uraClaimedToday(1_250, 250), 1_000);
});

test('NIM is divisible: one tap earns a fraction of a NIM', () => {
  const per = honeyPerTap(dailyCeiling(0));
  assert.equal(per, 10n);
  assert.equal(formatNim(per), '0.0001');
});

test('global budget stops earnings for everyone once spent', () => {
  const budget = 3n;
  const earned = tapDay(0, 10, budget);
  assert.equal(earned, 3n);
  const r = applyTap({ earnedToday: 0n }, dailyCeiling(0), 0n);
  assert.deepEqual(r, { gained: 0n, reason: 'budget' });
});

test('withdraw only from 1 NIM up', () => {
  assert.equal(canWithdraw(99_999n), false);
  assert.equal(canWithdraw(100_000n), true);
});

test('formatNim', () => {
  assert.equal(formatNim(0n), '0');
  assert.equal(formatNim(123_456_78n), '123.45678');
  assert.equal(formatNim(500_000n), '5');
});

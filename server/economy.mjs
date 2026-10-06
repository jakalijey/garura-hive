export const LUNA = 100_000n;

export const DEFAULTS = Object.freeze({
  BASE_DAILY_NIM: 1,
  NIM_PER_1000_URA: 5,
  MAX_DAILY_NIM: 20,
  FILL_TAPS: 10_000,
  MIN_WITHDRAW_NIM: 1,
  DAILY_BUDGET_NIM: 500,
});

const nimToLuna = (nim) => BigInt(Math.round(nim * 100_000));

export function dailyCeiling(uraClaimedToday, cfg = DEFAULTS) {
  const ura = Math.max(0, Math.floor(Number(uraClaimedToday) || 0));
  const base = nimToLuna(cfg.BASE_DAILY_NIM);
  const boost = (BigInt(ura) * nimToLuna(cfg.NIM_PER_1000_URA)) / 1000n;
  const max = nimToLuna(cfg.MAX_DAILY_NIM);
  const c = base + boost;
  return c > max ? max : c;
}

export function honeyPerTap(ceiling, cfg = DEFAULTS) {
  const per = ceiling / BigInt(cfg.FILL_TAPS);
  return per > 0n ? per : 1n;
}

export function applyTap(player, ceiling, budgetLeft, cfg = DEFAULTS) {
  if (budgetLeft <= 0n) return { gained: 0n, reason: 'budget' };
  const room = ceiling - player.earnedToday;
  if (room <= 0n) return { gained: 0n, reason: 'ceiling' };
  let g = honeyPerTap(ceiling, cfg);
  if (g > room) g = room;
  if (g > budgetLeft) g = budgetLeft;
  return { gained: g, reason: 'ok' };
}

export function canWithdraw(jar, cfg = DEFAULTS) {
  return jar >= nimToLuna(cfg.MIN_WITHDRAW_NIM);
}

export function uraClaimedToday(cumulativeNow, snapshotAtDayStart) {
  const d = Number(cumulativeNow) - Number(snapshotAtDayStart);
  return d > 0 ? d : 0;
}

export function dailyBudget(cfg = DEFAULTS) {
  return nimToLuna(cfg.DAILY_BUDGET_NIM);
}

export function formatNim(luna) {
  const neg = luna < 0n; const v = neg ? -luna : luna;
  const whole = v / LUNA; const frac = (v % LUNA).toString().padStart(5, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}

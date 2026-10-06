export const URA_CLAIM = '0x1A92989BCb0B7B0123bcd9e03c41E144e5c246C4';
const SELECTOR = '0x965d6441';
const RPCS = ['https://polygon.drpc.org', 'https://1rpc.io/matic', 'https://polygon-bor-rpc.publicnode.com'];

async function ethCall(data, fetchImpl = fetch) {
  let lastErr;
  for (const url of RPCS) {
    try {
      const r = await fetchImpl(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: URA_CLAIM, data }, 'latest'] }),
        signal: AbortSignal.timeout(8_000),
      });
      const j = await r.json();
      if (j.result && j.result !== '0x') return j.result;
      lastErr = new Error(j.error?.message || 'empty result');
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export async function uraClaimedTotal(address, fetchImpl = fetch) {
  const hex = await ethCall(SELECTOR + address.toLowerCase().slice(2).padStart(64, '0'), fetchImpl);
  return Number(BigInt(hex) / 10n ** 18n);
}

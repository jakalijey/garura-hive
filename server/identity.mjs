import * as Nimiq from '@nimiq/core';
import { createHash, randomBytes } from 'node:crypto';
import { verifyMessage, getAddress } from 'viem';

const NIMIQ_PREFIX = '\x16Nimiq Signed Message:\n';
const CHALLENGE_TTL_MS = 5 * 60_000;

export function makeChallenge(now = Date.now()) {
  const nonce = randomBytes(12).toString('hex');
  return { text: `Garura Honeycomb sign-in\nNonce: ${nonce}\nTime: ${now}`, nonce, issuedAt: now };
}

export function challengeFresh(ch, now = Date.now()) {
  return !!ch && now - ch.issuedAt >= 0 && now - ch.issuedAt < CHALLENGE_TTL_MS;
}

export function nimiqMessageHash(message) {
  const bytes = Buffer.from(message, 'utf8');
  return new Uint8Array(createHash('sha256')
    .update(Buffer.concat([Buffer.from(NIMIQ_PREFIX, 'utf8'), Buffer.from(String(bytes.length), 'utf8'), bytes]))
    .digest());
}

export function verifyNimiq(message, { publicKey, signature }) {
  try {
    if (!/^[0-9a-f]{64}$/i.test(publicKey) || !/^[0-9a-f]{128}$/i.test(signature)) return null;
    const pk = Nimiq.PublicKey.fromHex(publicKey);
    const sig = Nimiq.Signature.fromHex(signature);
    if (!pk.verify(sig, nimiqMessageHash(message))) return null;
    return pk.toAddress().toUserFriendlyAddress();
  } catch { return null; }
}

export async function verifyEvm(message, address, signature) {
  try {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
    const ok = await verifyMessage({ address: getAddress(address), message, signature });
    return ok ? getAddress(address) : null;
  } catch { return null; }
}

export function parseNimiqAddress(input) {
  try {
    const s = String(input || '').toUpperCase().replace(/\s+/g, '');
    if (!/^NQ[0-9]{2}[0-9A-Z]{32}$/.test(s)) return null;
    return Nimiq.Address.fromUserFriendlyAddress(s).toUserFriendlyAddress();
  } catch { return null; }
}

export function nimiqKey(addr) {
  return String(addr || '').replace(/\s+/g, '').toUpperCase();
}

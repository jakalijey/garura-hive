import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Nimiq from '@nimiq/core';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { makeChallenge, challengeFresh, nimiqMessageHash, verifyNimiq, verifyEvm, nimiqKey } from '../identity.mjs';

function nimiqSign(kp, message) {
  return { publicKey: kp.publicKey.toHex(), signature: kp.sign(nimiqMessageHash(message)).toHex() };
}

test('Nimiq signature: right message passes, returns the NQ address', () => {
  const kp = Nimiq.KeyPair.generate();
  const { text } = makeChallenge();
  const addr = verifyNimiq(text, nimiqSign(kp, text));
  assert.equal(addr, kp.toAddress().toUserFriendlyAddress());
  assert.match(addr, /^NQ\d{2}( [0-9A-Z]{4}){8}$/);
});

test('Nimiq signature: other message or other key fails', () => {
  const kp = Nimiq.KeyPair.generate();
  const s = nimiqSign(kp, 'a');
  assert.equal(verifyNimiq('b', s), null);
  const other = Nimiq.KeyPair.generate();
  assert.equal(verifyNimiq('a', { publicKey: other.publicKey.toHex(), signature: s.signature }), null);
  assert.equal(verifyNimiq('a', { publicKey: 'zz', signature: s.signature }), null);
});

test('EVM personal_sign: right address passes, wrong address fails', async () => {
  const acc = privateKeyToAccount(generatePrivateKey());
  const msg = makeChallenge().text;
  const sig = await acc.signMessage({ message: msg });
  assert.equal(await verifyEvm(msg, acc.address, sig), acc.address);
  const other = privateKeyToAccount(generatePrivateKey());
  assert.equal(await verifyEvm(msg, other.address, sig), null);
  assert.equal(await verifyEvm(msg + 'x', acc.address, sig), null);
});

test('challenge expires after 5 minutes', () => {
  const ch = makeChallenge(1_000_000);
  assert.equal(challengeFresh(ch, 1_000_000 + 60_000), true);
  assert.equal(challengeFresh(ch, 1_000_000 + 5 * 60_000), false);
});

test('nimiqKey normalises spacing and case', () => {
  assert.equal(nimiqKey('nq56 6q4l snek'), 'NQ566Q4LSNEK');
});

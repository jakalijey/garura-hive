import * as Nimiq from '@nimiq/core';
const k = (process.env.PAYOUT_PRIVATE_KEY || '').replace(/^0x/, '');
if (!/^[0-9a-fA-F]{64}$/.test(k)) { console.log('NO_KEY'); process.exit(1); }
console.log(Nimiq.KeyPair.derive(Nimiq.PrivateKey.fromHex(k)).toAddress().toUserFriendlyAddress());

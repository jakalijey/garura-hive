import * as Nimiq from '@nimiq/core';

export function createPayout({ privateKeyHex, network = 'MainAlbatross', log = console.log }) {
  if (!privateKeyHex) return { enabled: false, address: null, send: async () => { throw new Error('payouts_disabled'); } };

  const keyPair = Nimiq.KeyPair.derive(Nimiq.PrivateKey.fromHex(privateKeyHex.replace(/^0x/, '')));
  const address = keyPair.toAddress().toUserFriendlyAddress();
  let clientPromise = null;
  let chain = Promise.resolve();

  async function client() {
    if (!clientPromise) {
      clientPromise = (async () => {
        const config = new Nimiq.ClientConfiguration();
        config.network(network);
        const c = await Nimiq.Client.create(config.build());
        await c.waitForConsensusEstablished();
        log('payout: consensus established on', network, 'from', address);
        return c;
      })().catch((e) => { clientPromise = null; throw e; });
    }
    return clientPromise;
  }

  function send(recipient, luna, fee = 0n) {
    const job = chain.then(async () => {
      const c = await client();
      const [height, networkId] = await Promise.all([c.getHeadHeight(), c.getNetworkId()]);
      const tx = Nimiq.TransactionBuilder.newBasic(
        keyPair.toAddress(), Nimiq.Address.fromUserFriendlyAddress(recipient), luna, fee, height, networkId);
      tx.sign(keyPair);
      const details = await c.sendTransaction(tx);
      return details.transactionHash || tx.hash();
    });
    chain = job.catch(() => {});
    return job;
  }

  async function balance() {
    const c = await client();
    const acc = await c.getAccount(address);
    return BigInt(acc.balance ?? 0);
  }

  return { enabled: true, address, send, balance };
}

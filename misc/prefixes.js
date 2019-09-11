'use strict';

const logger = require('../index');

logger.log.info('1\n2\n3');

logger.log.warn(`
        for (const address of addresses) {
            try {
                const txs = await get_txs(address.attributes.address);
                console.log(txs.length);
                for (const tx of txs) {
                    if (!seen_txs[tx.txid]) {
                        seen_txs[tx.txid] = true;
                        for (const out of tx.vout) {
                            if (out.scriptPubKey.addresses) {
                                if (out.scriptPubKey.addresses.includes(address.attributes.address)) {
                                    try {
                                        await save_deposit(address.attributes.address, out.value, tx.txid, tx.blockheight,
                                            tx.confirmations, address.attributes.id);
                                    } catch (e) {
                                        console.error("error at saving deposit");
                                        console.error(e);
                                    }
                                }
                            } else {
                                console.log("no");
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("error getting the txs");
                console.error(e);
            }

        }
`);

logger.log.error('Some error', new Error('I am groot, er error'));

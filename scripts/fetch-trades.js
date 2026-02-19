const { ClobClient } = require('@polymarket/clob-client');
const { ethers } = require('ethers');
require('dotenv').config();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const client = new ClobClient(
        process.env.CLOB_API_URL || 'https://clob.polymarket.com',
        137,
        signer,
        {
            apiKey: process.env.CLOB_API_KEY,
            secret: process.env.CLOB_SECRET,
            passphrase: process.env.CLOB_PASSPHRASE
        }
    );

    console.log(`Checking trades for EOA: ${signer.address}...`);

    try {
        const trades = await client.getTrades({ maker_address: signer.address });
        console.log(`\nFound ${trades.length} maker trades.`);

        const tradesTaker = await client.getTrades({ taker_address: signer.address });
        console.log(`Found ${tradesTaker.length} taker trades.`);

        const all = [...trades, ...tradesTaker];
        console.log(`Total execution events: ${all.length}`);

        if (all.length > 0) {
            console.log("\nLast 5 trades details:");
            all.slice(0, 5).forEach(t => {
                console.log(`- ${t.match_time}: ${t.side} ${t.size} shares of ${t.market} (Tx: ${t.transaction_hash})`);
            });
        }

    } catch (e) {
        console.error("Error fetching trades:", e.message);
    }
}

run();

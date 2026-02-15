import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

    const client = new ClobClient(
        process.env.CLOB_API_URL || 'https://clob.polymarket.com',
        137,
        signer,
        {
            apiKey: process.env.CLOB_API_KEY!,
            secret: process.env.CLOB_SECRET!,
            passphrase: process.env.CLOB_PASSPHRASE!
        }
    );

    console.log(`Checking trades for EOA: ${signer.address}...`);

    try {
        // Fetch last 100 trades for this user as maker or taker
        const trades = await (client as any).getTrades({
            maker_address: signer.address
        });

        console.log(`\nFound ${trades.length} trades where EOA acted as Maker:`);
        trades.forEach((t: any) => {
            console.log(`- ${t.match_time} | ${t.side} ${t.size} shares of ${t.market} @ $${t.price} (Tx: ${t.transaction_hash})`);
        });

        const tradesTaker = await (client as any).getTrades({
            taker_address: signer.address
        });
        console.log(`\nFound ${tradesTaker.length} trades where EOA acted as Taker:`);
        tradesTaker.forEach((t: any) => {
            console.log(`- ${t.match_time} | ${t.side} ${t.size} shares of ${t.market} @ $${t.price} (Tx: ${t.transaction_hash})`);
        });

    } catch (e: any) {
        console.error("Error fetching trades:", e.message);
    }
}

run().catch(console.error);

import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
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

    console.log(`Checking positions for EOA: ${signer.address}...`);

    try {
        const positions = await client.getOpenPositions();
        console.log(`\nFound ${positions.length} open positions:`);

        positions.forEach((p: any) => {
            console.log(`- Market: ${p.market}, Outcome: ${p.outcome}, Size: ${p.size}, Avg Price: ${p.avgPrice}`);
        });

        if (positions.length === 0) {
            console.log("No open positions found on the API side.");
        }
    } catch (e: any) {
        console.error("Error fetching positions:", e.message);
    }
}

run().catch(console.error);

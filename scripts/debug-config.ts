import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    const client = new ClobClient(process.env.CLOB_API_URL!, 137, signer);

    // This is a bit hacky but we want to see what's in the client
    console.log('CLOB Host:', client.host);
    console.log('Chain ID:', client.chainId);

    // Attempt to get a mid price for a common asset to see if it works
    const testAsset = '1666594133611311020473212624460670050858880654032483161556950298132924191392'; // Random market
    try {
        const book = await client.getOrderBook(testAsset);
        console.log('Successfully connected to CLOB API.');
    } catch (e: any) {
        console.error('Failed to connect to CLOB API:', e.message);
    }
}

run();

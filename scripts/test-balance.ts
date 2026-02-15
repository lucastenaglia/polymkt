import { ClobClient, AssetType } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testBalance() {
    // Correct URL for Polymarket CLOB API
    const clobApiUrl = 'https://clob.polymarket.com';
    const rpcUrl = process.env.RPC_URL || 'https://polygon-rpc.com';
    const privateKey = process.env.PRIVATE_KEY;
    const results: any = { timestamp: new Date().toISOString() };

    if (!privateKey) {
        results.error = 'PRIVATE_KEY missing';
        fs.writeFileSync('balance_results.json', JSON.stringify(results, null, 2));
        return;
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    results.address = signer.address;

    try {
        console.log('Using API URL:', clobApiUrl);
        const tempClient = new ClobClient(clobApiUrl, 137, signer);
        const creds = await tempClient.deriveApiKey();
        results.l1_auth = 'SUCCESS';

        const client = new ClobClient(clobApiUrl, 137, signer, creds);
        results.l2_init = 'SUCCESS';

        console.log('Fetching collateral balance...');
        const resp = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
        results.collateral = resp;

        console.log('Balance found:', resp.balance);
    } catch (e: any) {
        results.error = e.message;
        console.error('Test failed:', e.message);
    }

    fs.writeFileSync('balance_results.json', JSON.stringify(results, null, 2));
}

testBalance().catch(err => {
    fs.writeFileSync('balance_results.json', JSON.stringify({ error: err.message }, null, 2));
});

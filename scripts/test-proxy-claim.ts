import { ethers } from 'ethers';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

// Standard ABIs for testing
const CONDITIONAL_TOKENS_ADDR = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_E_ADDR = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

async function testRedeemDetection() {
    const proxyAddr = process.env.PROXY_ADDRESS;
    const eoaAddr = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY).address : null;

    console.log('--- REDEEM DETECTION TEST ---');
    console.log(`EOA: ${eoaAddr}`);
    console.log(`Proxy: ${proxyAddr || 'Not Set'}`);

    const targetAddr = proxyAddr || eoaAddr;
    if (!targetAddr) {
        console.error('No target address found.');
        return;
    }

    console.log(`Checking redeemable positions for: ${targetAddr}...`);
    try {
        const url = `https://data-api.polymarket.com/positions?user=${targetAddr}`;
        const res = await axios.get(url);

        if (res.data && Array.isArray(res.data)) {
            const redeemable = res.data.filter((p: any) => p.redeemable === true);
            console.log(`Found ${res.data.length} total positions.`);
            console.log(`Found ${redeemable.length} redeemable positions.`);

            redeemable.forEach((p: any) => {
                console.log(`- [${p.slug}] Outcome: ${p.outcome}, Index: ${p.outcomeIndex}, Amount: ${p.currentValue}`);
            });

            if (redeemable.length > 0) {
                console.log('\n✅ Detection works! The bot would attempt to claim these positions.');
            } else {
                console.log('\nℹ️ No redeemable positions found currently to perform on-chain test.');
            }
        }
    } catch (e: any) {
        console.error('Error fetching positions:', e.message);
    }
}

testRedeemDetection();

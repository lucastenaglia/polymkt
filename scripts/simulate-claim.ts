import axios from 'axios';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { config } from '../src/config';

dotenv.config();

async function simulate() {
    console.log('--- SIMULATION: REDEEMABLE POSITIONS REPORT ---');

    const funder = config.proxyAddress || process.env.PUBLIC_KEY;
    if (!funder) {
        console.error('Error: No PROXY_ADDRESS or account found in .env');
        return;
    }

    console.log(`🔍 Checking Portfolio for: ${funder}`);

    try {
        const posRes = await axios.get(`https://data-api.polymarket.com/positions?user=${funder}`);
        const redeemable = posRes.data.filter((p: any) => p.redeemable === true);

        if (redeemable.length === 0) {
            console.log('❌ No winning positions found by the API.');
            return;
        }

        console.log(`✅ Found ${redeemable.length} winning positions:\n`);

        let totalValue = 0;
        redeemable.forEach((p: any, i: number) => {
            const val = parseFloat(p.curValue || p.size) || 0;
            totalValue += val;
            console.log(`${i + 1}. [${p.title}]`);
            console.log(`   Outcome: ${p.outcome} | Value: $${val.toFixed(2)}`);
            console.log(`   ConditionID: ${p.conditionId}\n`);
        });

        console.log('---------------------------------------------');
        console.log(`TOTAL ESTIMATED TO REDEEM: $${totalValue.toFixed(2)}`);
        console.log('---------------------------------------------');

        console.log('\n⚠️  ESTADO DE RED:');
        const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
        const fee = await provider.getFeeData();
        const base = ethers.utils.formatUnits(fee.lastBaseFeePerGas || 0, 'gwei');
        console.log(`Gas Base actual: ${base} Gwei (Si es > 200, está congestionado)`);

        const wallet = new ethers.Wallet(config.privateKey);
        const pending = await provider.getTransactionCount(wallet.address, 'pending');
        const latest = await provider.getTransactionCount(wallet.address, 'latest');
        console.log(`Billetera Bot: ${wallet.address}`);
        console.log(`Transacciones en cola: ${pending - latest}`);

        const results = {
            funder,
            redeemableCount: redeemable.length,
            positions: redeemable.map((p: any) => ({
                title: p.title,
                outcome: p.outcome,
                value: parseFloat(p.curValue || p.size) || 0,
                conditionId: p.conditionId
            })),
            totalValue,
            network: {
                baseFeeGwei: base,
                isCongested: parseFloat(base) > 200,
                pendingTransactions: pending - latest
            }
        };

        const fs = require('fs');
        fs.writeFileSync('simulation_results.json', JSON.stringify(results, null, 2));
        console.log('✅ Simulation results saved to simulation_results.json');

    } catch (e: any) {
        console.error('Error fetching positions:', e.message);
    }
}

simulate();

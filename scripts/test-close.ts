import { closeAllPositions } from '../src/trader';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { ClobClient } from '@polymarket/clob-client';
import { config } from '../src/config';

dotenv.config();

// MOCK init to setup trader state without full startup
async function mockInit() {
    console.log("🛠️ Mock Initializing Trader...");
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const signer = new ethers.Wallet(config.privateKey, provider);

    // We need to set the internal variables in trader.ts
    // Since they are not exported, we can't easily set them directly if we import 'init'.
    // However, closeAllPositions uses exported 'db'. 
    // It calls 'closeSpecificPosition' which uses 'clobClient' and 'signer' which are module-level vars in trader.ts.

    // Problem: We cannot set 'clobClient' or 'signer' in trader.ts from here if they are not exported.
    // Solution: We must use the real 'init' but maybe mock the network parts?
    // OR: We temporarily export them in trader.ts for testing?

    // Attempt 1: Try running init again but with a timeout on the promise?
    // Attempt 2: Just run init() but log exactly where it hangs.

    // Let's rely on the previous finding: init hangs. 
    // It's likely `await getBalances()` or proxy detection.

    // I will try to use the REAL init, but I'll comment out the potentially blocking calls in trader.ts temporarily? 
    // No, that's invasive.

    // Let's try to just run it and see. If it hangs, it hangs. 
    // But I will add a race with timeout for init.

    const { init } = require('../src/trader');
    await Promise.race([
        init(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Init timed out")), 10000))
    ]);
}

async function main() {
    console.log("🧪 Testing Close All Positions...");
    try {
        await mockInit();
        console.log("Init complete.");

        console.log("Calling closeAllPositions...");
        const result = await closeAllPositions();
        console.log("Result:", result);
        process.exit(0);
    } catch (e) {
        console.error("Test Failed:", e);
        process.exit(1);
    }
}

// Safety timeout
setTimeout(() => {
    console.error("Test timed out!");
    process.exit(1);
}, 30000);

main();

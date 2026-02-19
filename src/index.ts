import { startMonitoring } from './monitor';
import { init as initTrader } from './trader';
import { startBot as startTelegramBot } from './telegram';
import { config } from './config';

async function main() {
    console.log('🚀 Starting Polymarket Copy Bot...');

    if (!config.privateKey) {
        console.error('❌ ERROR: PRIVATE_KEY is missing in .env file.');
        process.exit(1);
    }

    await startTelegramBot();
    await initTrader();
    startMonitoring();

    // Start Auto-Claim Task
    const { claimPositions } = require('./trader');
    console.log(`🕒 Automatic Claim task started (Interval: ${config.autoClaimIntervalMs / 1000}s)`);

    // Initial run at startup
    setTimeout(async () => {
        try {
            console.log('[AUTO-CLAIM] Initial startup run...');
            await claimPositions();
        } catch (e: any) {
            console.error('[AUTO-CLAIM] Error in startup task:', e.message);
        }
    }, 5000); // Wait 5s for everything to stabilize

    setInterval(async () => {
        try {
            console.log('[AUTO-CLAIM] Running periodic claim task...');
            await claimPositions();
        } catch (e: any) {
            console.error('[AUTO-CLAIM] Error in background task:', e.message);
        }
    }, config.autoClaimIntervalMs);

    console.log('👀 Monitoring active for:', config.targetUsers);
}

main().catch(console.error);

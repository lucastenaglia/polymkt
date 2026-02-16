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
    setInterval(async () => {
        try {
            await claimPositions();
        } catch (e: any) {
            console.error('[AUTO-CLAIM] Error in background task:', e.message);
        }
    }, config.autoClaimIntervalMs);

    console.log('👀 Monitoring active for:', config.targetUsers);
}

main().catch(console.error);

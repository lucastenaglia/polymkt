import { monitorEvents } from '../src/monitor';
import { init as initTrader } from '../src/trader';

// Mock Config to force Dry Run
process.env.PRIVATE_KEY = '';

async function run() {
    console.log('🧪 Starting Simulation...');

    // Init Trader (will warn about dry run)
    await initTrader();

    // Mock Event
    const mockEvent = {
        user: '0x8dxd', // A target user
        txHash: '0xSIMULATED_TX_' + Date.now(),
        maker: '0x8dxd',
        taker: '0xExchange',
        // Example Asset ID (Random large number, unlikely to resolve but tests flow)
        // To test real resolution, we'd need a real asset ID active in their history.
        // For now, we expect resolution to fail or mock it.
        makerAssetId: '123456789',
        takerAssetId: '0'
    };

    console.log('🔫 Firing simulated event...');
    monitorEvents.emit('trade_detected', mockEvent);

    // Keep alive to see logs
    setTimeout(() => {
        console.log('✅ Simulation complete.');
    }, 5000);
}

run();

import { init, claimPositions } from '../src/trader';

async function run() {
    console.log('--- STARTING STANDALONE CLAIM SCRIPT ---');

    // Initialize the trader (sets up signer, API credentials, and proxy detection)
    await init();

    console.log('\n🔍 Checking for winning positions to redeem...');
    const result = await claimPositions();

    console.log('\n✅ Script Execution Finished.');
    console.log('Final Result:', result);

    // Give a small delay for logs to flush
    setTimeout(() => process.exit(0), 1000);
}

run().catch(err => {
    console.error('\n❌ FATAL ERROR in manual-claim script:');
    console.error(err);
    process.exit(1);
});

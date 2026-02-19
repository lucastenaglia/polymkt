import { init, claimPositions } from './trader';

async function run() {
    console.log('--- STARTING STANDALONE CLAIM ---');
    try {
        await init();
        console.log('Trader initialized. Starting claim scan...');
        const result = await claimPositions();
        console.log('Claim process finished.');
        console.log('Result:', result);
    } catch (error: any) {
        console.error('An error occurred during standalone claim:', error.message);
    } finally {
        console.log('--- CLAIM PROCESS ENDED ---');
        process.exit(0);
    }
}

run();

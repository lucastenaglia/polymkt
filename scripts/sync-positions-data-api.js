const axios = require('axios');

const PROXY = '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b'.toLowerCase();

async function run() {
    console.log(`Searching for existing positions for Proxy: ${PROXY}...`);
    try {
        // Data API endpoint
        const url = `https://data-api.polymarket.com/positions?user=${PROXY}`;
        const resp = await axios.get(url);

        const data = resp.data;
        if (!data || data.length === 0) {
            console.log("No active positions found on-chain via Data API.");
            return;
        }

        console.log(`\nFound ${data.length} positions:`);
        data.forEach((p, i) => {
            console.log(`${i + 1}. Condition ID: ${p.conditionId}`);
            console.log(`   Market: ${p.marketSlug} | Outcome: ${p.outcome}`);
            console.log(`   Size: ${p.size} | Value: $${p.curValue}`);
            console.log('   ---');
        });

    } catch (e) {
        console.error("Error fetching portfolio:", e.response?.data || e.message);
    }
}

run();

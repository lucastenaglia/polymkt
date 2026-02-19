const axios = require('axios');

const PROXY = '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b'.toLowerCase();

async function run() {
    console.log(`Searching for existing positions for Proxy: ${PROXY}...`);
    try {
        // Try the Gamma portfolio endpoint
        const url = `https://gamma-api.polymarket.com/portfolio?userAddress=${PROXY}`;
        const resp = await axios.get(url);

        const data = resp.data;
        if (!data || data.length === 0) {
            console.log("No active positions found on-chain.");
            return;
        }

        console.log(`\nFound ${data.length} positions:`);
        data.forEach((p, i) => {
            console.log(`${i + 1}. Market: ${p.marketSlug} (${p.marketID})`);
            console.log(`   Outcome: ${p.outcome} | Value: $${p.positionValue}`);
        });

    } catch (e) {
        console.error("Error fetching portfolio:", e.response?.data || e.message);
    }
}

run();

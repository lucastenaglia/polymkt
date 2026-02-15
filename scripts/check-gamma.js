const axios = require('axios');

async function run() {
    const eoa = '0x52676040D122524DbB9D7bc1FF9764a1027a9897';
    const url = `https://gamma-api.polymarket.com/portfolio?userAddress=${eoa}`;

    console.log(`Querying Gamma API for EOA: ${eoa}...`);
    try {
        const response = await axios.get(url);
        const data = response.data;

        if (data.length === 0) {
            console.log("No positions found in Gamma Portfolio.");
            return;
        }

        console.log(`\nFound ${data.length} positions:`);
        data.forEach(p => {
            console.log(`- Market: ${p.marketSlug}`);
            console.log(`  Asset:  ${p.assetSlug} (${p.outcome})`);
            console.log(`  Shares: ${p.size}`);
            console.log(`  Value:  $${p.positionValue}`);
            console.log('-------------------');
        });

    } catch (e) {
        console.error("Error query Gamma API:", e.message);
        if (e.response) {
            console.error("Response:", e.response.data);
        }
    }
}

run();

const axios = require('axios');

async function run() {
    const username = 'livebreathevolatility';
    console.log(`Searching for address for username: ${username}`);
    try {
        // Polymarket Data API profile search
        const url = `https://data-api.polymarket.com/profiles?username=${username}`;
        const resp = await axios.get(url);

        console.log('Response:', JSON.stringify(resp.data, null, 2));
    } catch (e) {
        console.error('Error:', e.response?.data || e.message);
    }
}

run();

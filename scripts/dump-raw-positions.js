const axios = require('axios');

const PROXY = '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b'.toLowerCase();

async function run() {
    console.log(`Dumping RAW first position for Proxy: ${PROXY}...`);
    try {
        const url = `https://data-api.polymarket.com/positions?user=${PROXY}`;
        const resp = await axios.get(url);

        if (resp.data && resp.data.length > 0) {
            console.log(JSON.stringify(resp.data[0], null, 2));
        } else {
            console.log("No positions found.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();

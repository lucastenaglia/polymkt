const axios = require('axios');

async function checkAddress(addr) {
    console.log(`Checking Polymarket profile for address: ${addr}`);
    try {
        const url = `https://data-api.polymarket.com/profiles?address=${addr}`;
        const resp = await axios.get(url);
        console.log('Profile Data:', JSON.stringify(resp.data, null, 2));
    } catch (e) {
        console.error('Error:', e.response?.data || e.message);
    }
}

checkAddress('0x818f214c7f3e479cce1d964d53fe3db7297558cb');

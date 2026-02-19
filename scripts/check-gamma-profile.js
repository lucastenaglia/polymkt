const axios = require('axios');

const EOA = '0x52676040D122524DbB9D7bc1FF9764a1027a9897';

async function check() {
    console.log('Fetching PolyMarket Gamma profile for:', EOA);
    try {
        // Gamma API is often more up to date for modern profiles
        const resp = await axios.get(`https://gamma-api.polymarket.com/profiles?address=${EOA}`);
        console.log('Profile Data:', JSON.stringify(resp.data, null, 2));
    } catch (e) {
        console.error('API Error:', e.response?.data || e.message);
    }
}

check();

const axios = require('axios');

const API_URL = 'https://data-api.polymarket.com/activity';
const POSITIONS_URL = 'https://data-api.polymarket.com/positions';
const USER = '0x8dxd';

async function test(url, paramName) {
    try {
        console.log(`Testing ${url} with param ${paramName}...`);
        const params = {};
        params[paramName] = USER;
        params.limit = 1;

        const response = await axios.get(url, { params });
        console.log(`SUCCESS with ${paramName}:`, response.status);
        console.log(JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        if (error.response) {
            console.log(`FAILED with ${paramName}:`, error.response.status, error.response.data);
        } else {
            console.log(`FAILED with ${paramName}:`, error.message);
        }
        return false;
    }
}

async function run() {
    await test(API_URL, 'user');
    await test(API_URL, 'address');
    await test(API_URL, 'wallet');

    console.log('--- Testing /positions ---');
    await test(POSITIONS_URL, 'user');
    await test(POSITIONS_URL, 'address');
}

run();

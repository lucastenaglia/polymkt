import axios from 'axios';

const API_URL = 'https://data-api.polymarket.com/activity';
const USER = '0x8dxd'; // One of the targets

async function run() {
    try {
        console.log(`Fetching activity for ${USER}...`);
        const response = await axios.get(API_URL, {
            params: {
                user: USER,
                limit: 2,
            },
        });
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error(error);
    }
}

run();

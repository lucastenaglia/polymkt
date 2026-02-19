const { ethers } = require('ethers');
require('dotenv').config();
const rpcUrl = process.env.RPC_URL;

async function test() {
    console.log(`Testing StaticJsonRpcProvider with URL: ${rpcUrl}`);
    try {
        const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, { name: 'polygon', chainId: 137 });
        const block = await provider.getBlockNumber();
        console.log('✅ StaticProvider Success! Block:', block);
    } catch (e) {
        console.error('❌ StaticProvider Failed!');
        console.error('Message:', e.message);
        console.error('Code:', e.code);
        console.error('Error string:', String(e));
        if (e.body) console.error('Body:', e.body);
    }
}

test();

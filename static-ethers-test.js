const { ethers } = require('ethers');
const rpcUrl = 'https://polygon-rpc.com';

async function test() {
    console.log(`Testing Staticethers with URL: ${rpcUrl}`);
    try {
        const p1 = new ethers.providers.StaticJsonRpcProvider(rpcUrl, { name: 'polygon', chainId: 137 });
        const b1 = await p1.getBlockNumber();
        console.log('✅ Static Success! Block:', b1);
    } catch (e) {
        console.error('❌ Static Failed:', e.message);
        console.error(e);
    }
}

test();

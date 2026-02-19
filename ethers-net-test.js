const { ethers } = require('ethers');
const rpcUrl = 'https://polygon-rpc.com';

async function test() {
    console.log(`Testing ethers with URL: ${rpcUrl}`);
    try {
        // Try without network object first
        const p1 = new ethers.providers.JsonRpcProvider(rpcUrl);
        const b1 = await p1.getBlockNumber();
        console.log('✅ p1 Success! Block:', b1);

        // Try with network object (as in trader.ts)
        const p2 = new ethers.providers.JsonRpcProvider(rpcUrl, { name: 'polygon', chainId: 137 });
        const b2 = await p2.getBlockNumber();
        console.log('✅ p2 Success! Block:', b2);
    } catch (e) {
        console.error('❌ ethers Failed:', e.message);
        console.error(e);
    }
}

test();

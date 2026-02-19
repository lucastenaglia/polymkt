const ethers = require('ethers');

async function testRpc(name, url) {
    console.log(`Testing ${name}: ${url}...`);
    try {
        const provider = new ethers.providers.JsonRpcProvider(url);
        const block = await provider.getBlockNumber();
        console.log(`✅ ${name} Success! Block: ${block}`);
        return true;
    } catch (e) {
        console.log(`❌ ${name} Failed: ${e.message}`);
        return false;
    }
}

async function main() {
    const rpcs = [
        { name: 'llama', url: 'https://polygon.llamarpc.com' },
        { name: 'ankr', url: 'https://rpc.ankr.com/polygon' },
        { name: 'polygon-rpc', url: 'https://polygon-rpc.com' },
        { name: 'pokt', url: 'https://poly-mainnet.gateway.pokt.network/v1/lb/627a4e616f7c7f003a38a0c1' },
        { name: '1rpc', url: 'https://1rpc.io/matic' }
    ];

    for (const rpc of rpcs) {
        await testRpc(rpc.name, rpc.url);
    }
}

main();

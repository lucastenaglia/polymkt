const { ethers } = require('ethers');

async function testRpc(name, url) {
    console.log(`Testing ${name}: ${url}...`);
    try {
        const provider = new ethers.providers.StaticJsonRpcProvider(url, { name: 'polygon', chainId: 137 });
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
        { name: 'blastapi', url: 'https://polygon-mainnet.public.blastapi.io' },
        { name: 'maticvigil', url: 'https://rpc-mainnet.maticvigil.com' },
        { name: 'drpc', url: 'https://polygon.drpc.org' },
        { name: 'meowrpc', url: 'https://polygon.meowrpc.com' },
        { name: 'quiknode_pub', url: 'https://rpc-mainnet.matic.quiknode.pro' },
        { name: 'tendermint', url: 'https://polygon.gateway.tendermint.network' },
        { name: '1rpc', url: 'https://1rpc.io/matic' },
        { name: 'llama', url: 'https://polygon.llamarpc.com' },
        { name: 'pokt_free', url: 'https://poly-rpc.gateway.pokt.network' }
    ];

    for (const rpc of rpcs) {
        await testRpc(rpc.name, rpc.url);
    }
}

main();

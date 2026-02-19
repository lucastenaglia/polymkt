import { ethers } from 'ethers';
import { CTF_EXCHANGE_ADDR_NEGRISK, CTF_EXCHANGE_ADDR_BINARY } from '../src/abi';

// Alternative RPCs
const RPC_URLS = [
    'https://polygon-bor.publicnode.com',
    'https://1rpc.io/matic',
    'https://polygon-rpc.com'
];

async function checkEventsWithRpc(rpcData: string) {
    const provider = new ethers.providers.JsonRpcProvider(rpcData);
    const topic = ethers.utils.id("OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)");

    console.log(`Checking ${rpcData}...`);
    try {
        const blockNumber = await provider.getBlockNumber();
        console.log(`Current Block: ${blockNumber}`);
        const fromBlock = blockNumber - 100;

        // Check NegRisk
        const logs = await provider.getLogs({
            address: CTF_EXCHANGE_ADDR_NEGRISK,
            topics: [topic],
            fromBlock,
            toBlock: blockNumber
        });
        console.log(`NegRisk Events: ${logs.length}`);
        if (logs.length > 0) console.log(logs[0]);

        // Check Binary
        const logs2 = await provider.getLogs({
            address: CTF_EXCHANGE_ADDR_BINARY,
            topics: [topic],
            fromBlock,
            toBlock: blockNumber
        });
        console.log(`Binary Events: ${logs2.length}`);

    } catch (error: any) {
        console.error(`RPC ${rpcData} failed:`, error.message);
    }
}

async function run() {
    for (const rpc of RPC_URLS) {
        await checkEventsWithRpc(rpc);
        // If successful, maybe break? Or just check all to find best.
    }
}

run();

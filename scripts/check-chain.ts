import { ethers } from 'ethers';
import { CTF_EXCHANGE_ABI, CTF_EXCHANGE_ADDR_BINARY } from '../src/abi';

const RPC_URL = 'https://polygon-rpc.com';
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

async function checkEvents(contractAddress: string, name: string) {
    const contract = new ethers.Contract(contractAddress, CTF_EXCHANGE_ABI, provider);
    console.log(`Checking ${name} (${contractAddress})...`);

    try {
        const blockNumber = await provider.getBlockNumber();
        console.log(`Current Block: ${blockNumber}`);
        const fromBlock = blockNumber - 100;

        // Filter for any OrderFilled event
        const events = await contract.queryFilter('OrderFilled', fromBlock, blockNumber);
        console.log(`Found ${events.length} events in last 100 blocks for ${name}.`);

        events.forEach((event, index) => {
            if (event.args) {
                console.log(`Event ${index}: maker=${event.args[1]} taker=${event.args[2]}`);
            }
        });

    } catch (error: any) {
        console.error(`Error checking ${name}:`, error);
        if (error.info) console.error('Error Info:', error.info);
        if (error.code) console.error('Error Code:', error.code);
    }
}

async function run() {
    await checkEvents(CTF_EXCHANGE_ADDR_BINARY, 'Binary Exchange');
}

run();

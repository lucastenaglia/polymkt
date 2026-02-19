import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const txHash = '0x81fc00fa6af132cc043dcf45b1d6e4f37b93104a8c6f09cd9f969728e7e6a2ca';

    console.log(`Inspecting Tx: ${txHash}...`);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
        console.log("Tx not found.");
        return;
    }

    console.log(`Status: ${receipt.status === 1 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`Block:  ${receipt.blockNumber}`);

    console.log(`\nLogs: ${receipt.logs.length}`);
    receipt.logs.forEach((log, i) => {
        console.log(`Log ${i}: Address ${log.address}`);
        // Topic 0 is event signature
        console.log(`      Topic 0: ${log.topics[0]}`);
    });

}

run().catch(console.error);

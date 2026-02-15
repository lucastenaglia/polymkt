import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');

    const hashes = [
        '0x739339a06e45de30c850ff2b32976ad1cd36403452957db7adfbe5a718297cea',
        '0xdcc6bfa9c928559ae8da89c6c09a09c37d0b3615755786fca93fe03d39669641'
    ];

    for (const hash of hashes) {
        console.log(`Checking TX: ${hash}`);
        const receipt = await provider.getTransactionReceipt(hash);
        if (receipt) {
            console.log(` Status: ${receipt.status === 1 ? 'SUCCESS' : 'FAILED'}`);
            console.log(` Block:  ${receipt.blockNumber}`);
        } else {
            console.log(` Status: NOT FOUND / PENDING`);
        }
    }
}

run();

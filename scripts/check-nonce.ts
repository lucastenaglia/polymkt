import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

    const nonce = await provider.getTransactionCount(signer.address);
    const pendingNonce = await provider.getTransactionCount(signer.address, 'pending');
    console.log(`EOA: ${signer.address}`);
    console.log(`Latest Nonce:  ${nonce}`);
    console.log(`Pending Nonce: ${pendingNonce}`);
}

run();

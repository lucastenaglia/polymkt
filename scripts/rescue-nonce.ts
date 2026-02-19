import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const ABI = ["function approve(address spender, uint256 amount) returns (bool)"];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

    console.log(`EOA: ${signer.address}`);

    const usdc = new ethers.Contract(USDC_E, ABI, signer);

    console.log('--- RESCUING NONCE 0 ---');
    console.log('Sending approve with high gas...');

    // We use a massive Max Fee and Priority Fee to ensure it gets in.
    const tx = await usdc.approve(CTF_EXCHANGE, ethers.constants.MaxUint256, {
        nonce: 0,
        maxPriorityFeePerGas: ethers.utils.parseUnits('60', 'gwei'),
        maxFeePerGas: ethers.utils.parseUnits('1500', 'gwei'),
        gasLimit: 100000
    });

    console.log(`Rescue Tx Sent: ${tx.hash}`);
    console.log('Waiting for confirmation...');
    await tx.wait();
    console.log('✅ SUCCESS! Nonce 0 cleared and allowance should be set.');
}

run().catch(console.error);

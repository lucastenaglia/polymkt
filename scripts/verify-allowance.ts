import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const ABI = ["function allowance(address,address) view returns (uint256)"];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    const usdc = new ethers.Contract(USDC_E, ABI, provider);

    const allowance = await usdc.allowance(signer.address, CTF_EXCHANGE);
    console.log(`EOA: ${signer.address}`);
    console.log(`Spender: ${CTF_EXCHANGE}`);
    console.log(`Allowance: ${ethers.utils.formatUnits(allowance, 6)} USDC.e`);
}

run();

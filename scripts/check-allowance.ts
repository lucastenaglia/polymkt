import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const FACTORY = '0xaebc4787d1bd97acc3353599908de16335198e3b';

const ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];
const F_ABI = ["function proxyFor(address) view returns (address)"];

async function run() {
    if (!process.env.PRIVATE_KEY) {
        console.error('PRIVATE_KEY is missing');
        return;
    }

    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const factory = new ethers.Contract(FACTORY, F_ABI, provider);
    const usdc = new ethers.Contract(USDC_E, ABI, provider);

    const proxyAddr = await factory.proxyFor(signer.address);
    console.log(`EOA:   ${signer.address}`);
    console.log(`Proxy: ${proxyAddr}`);

    if (proxyAddr === ethers.constants.AddressZero) {
        console.log('❌ No Proxy found for this EOA.');
        return;
    }

    const balance = await usdc.balanceOf(proxyAddr);
    const allowance = await usdc.allowance(proxyAddr, CTF_EXCHANGE);

    console.log(`\nProxy Balance:   ${ethers.utils.formatUnits(balance, 6)} USDC.e`);
    console.log(`Proxy Allowance: ${ethers.utils.formatUnits(allowance, 6)} USDC.e (Target: CTF Exchange)`);

    if (allowance.isZero() || allowance.lt(ethers.utils.parseUnits('1', 6))) {
        console.log('❌ Allowance is LOW or ZERO. The Bot should handle this via clob-client.');
        console.log('Testing EOA allowance as well...');
        const eoaBal = await usdc.balanceOf(signer.address);
        const eoaAll = await usdc.allowance(signer.address, CTF_EXCHANGE);
        console.log(`EOA Balance:     ${ethers.utils.formatUnits(eoaBal, 6)} USDC.e`);
        console.log(`EOA Allowance:   ${ethers.utils.formatUnits(eoaAll, 6)} USDC.e`);
    } else {
        console.log('✅ Allowance is present on-chain for the Proxy!');
    }
}

run().catch(console.error);

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const USDC_N = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const FACTORY = '0xaebc4787d1bd97acc3353599908de16335198e3b';

const ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)"
];
const F_ABI = ["function proxyFor(address) view returns (address)"];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    const factory = new ethers.Contract(FACTORY, F_ABI, provider);
    const usdcE = new ethers.Contract(USDC_E, ABI, provider);
    const usdcN = new ethers.Contract(USDC_N, ABI, provider);

    const proxy = await factory.proxyFor(signer.address);
    console.log(`EOA:   ${signer.address}`);
    console.log(`Proxy: ${proxy}`);

    if (proxy === ethers.constants.AddressZero) {
        console.log('❌ No Proxy found.');
        return;
    }

    const be = await usdcE.balanceOf(proxy);
    const ae = await usdcE.allowance(proxy, CTF_EXCHANGE);
    const bn = await usdcN.balanceOf(proxy);
    const an = await usdcN.allowance(proxy, CTF_EXCHANGE);

    console.log('\n--- PROXY STATUS ---');
    console.log(`USDC.e Balance:   ${ethers.utils.formatUnits(be, 6)}`);
    console.log(`USDC.e Allowance: ${ethers.utils.formatUnits(ae, 6)}`);
    console.log(`USDC (N) Balance:   ${ethers.utils.formatUnits(bn, 6)}`);
    console.log(`USDC (N) Allowance: ${ethers.utils.formatUnits(an, 6)}`);
}

run().catch(console.error);

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const USDC_N = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const FACTORY = '0xaebc4787d1bd97acc3353599908de16335198e3b';

const ABI = ["function balanceOf(address) view returns (uint256)"];
const F_ABI = ["function proxyFor(address) view returns (address)"];

async function run() {
    if (!process.env.PRIVATE_KEY) return;
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const factory = new ethers.Contract(FACTORY, F_ABI, provider);
    const usdcE = new ethers.Contract(USDC_E, ABI, provider);
    const usdcN = new ethers.Contract(USDC_N, ABI, provider);

    const proxy = await factory.proxyFor(signer.address);

    console.log('--- RE-VERIFYING BALANCES ---');
    console.log(`EOA:   ${signer.address}`);
    console.log(`Proxy: ${proxy}`);

    const eBale = await usdcE.balanceOf(signer.address);
    const eBaln = await usdcN.balanceOf(signer.address);
    const pBale = await usdcE.balanceOf(proxy);
    const pBaln = await usdcN.balanceOf(proxy);

    console.log('\n[EOA]');
    console.log(` USDC.e: ${ethers.utils.formatUnits(eBale, 6)}`);
    console.log(` USDC.n: ${ethers.utils.formatUnits(eBaln, 6)}`);

    console.log('\n[PROXY]');
    console.log(` USDC.e: ${ethers.utils.formatUnits(pBale, 6)}`);
    console.log(` USDC.n: ${ethers.utils.formatUnits(pBaln, 6)}`);

    const matic = await provider.getBalance(signer.address);
    console.log(`\nMATIC (EOA): ${ethers.utils.formatEther(matic)}`);
}

run();

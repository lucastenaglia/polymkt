import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_N = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const ABI = [{
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
}];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');

    // Use lowercased addresses to stay safe, then let Contract handle the rest
    const eoa = '0x52676040D122524DbB9D7bc1FF9764a1027a9897'.toLowerCase();
    const proxy = '0x15A3215842B12b1986530a775433ceB501869324'.toLowerCase();

    const usdcE = new ethers.Contract(USDC_E, ABI, provider);
    const usdcN = new ethers.Contract(USDC_N, ABI, provider);

    console.log(`\n--- BALANCES CHECK ---`);

    const maticEOA = await provider.getBalance(eoa);
    const beE = await usdcE.balanceOf(eoa);
    const beN = await usdcN.balanceOf(eoa);

    console.log(`EOA (${eoa}):`);
    console.log(`  Matic:  ${ethers.utils.formatEther(maticEOA)}`);
    console.log(`  USDC.e: ${ethers.utils.formatUnits(beE, 6)}`);
    console.log(`  USDC:   ${ethers.utils.formatUnits(beN, 6)}`);

    const maticProxy = await provider.getBalance(proxy);
    const bpE = await usdcE.balanceOf(proxy);
    const bpN = await usdcN.balanceOf(proxy);

    console.log(`Proxy (${proxy}):`);
    console.log(`  Matic:  ${ethers.utils.formatEther(maticProxy)}`);
    console.log(`  USDC.e: ${ethers.utils.formatUnits(bpE, 6)}`);
    console.log(`  USDC:   ${ethers.utils.formatUnits(bpN, 6)}`);
}

run().catch(err => {
    console.error("Error:", err);
});

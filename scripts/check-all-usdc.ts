import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const RPC_URL = process.env.RPC_URL || 'https://polygon-rpc.com';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const USDC_NATIVE = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';

const ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];

async function check() {
    if (!PRIVATE_KEY) return;
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const address = wallet.address;

    console.log('Checking balances for:', address);

    const matic = await provider.getBalance(address);
    console.log('Native MATIC:', ethers.utils.formatEther(matic));

    for (const token of [USDC_NATIVE, USDC_E]) {
        const contract = new ethers.Contract(token, ABI, provider);
        try {
            const bal = await contract.balanceOf(address);
            const dec = await contract.decimals();
            console.log(`Token ${token === USDC_NATIVE ? '(Native)' : '(Bridged)'} ${token}: ${ethers.utils.formatUnits(bal, dec)}`);
        } catch (e: any) {
            console.error(`Error checking ${token}:`, e.message);
        }
    }
}

check();

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const ABI = ["function balanceOf(address) view returns (uint256)"];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const usdc = new ethers.Contract(USDC_E, ABI, provider);

    const proxy = '0x15A3215842B12b1986530a775433ceB501869324';

    const bal = await usdc.balanceOf(proxy);
    console.log(`Balance Proxy 0x15A3...: ${ethers.utils.formatUnits(bal, 6)} USDC.e`);
}

run().catch(console.error);

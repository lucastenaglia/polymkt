import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const ABI = ["function balanceOf(address) view returns (uint256)"];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const usdc = new ethers.Contract(USDC_E, ABI, provider);

    const addr1 = '0x52676040D122524DbB9D7bc1FF9764a1027a9897'; // Phantom / Signer
    const addr2 = '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b'; // Account user mentioned

    const bal1 = await usdc.balanceOf(addr1);
    const bal2 = await usdc.balanceOf(addr2);

    console.log(`Balance 0x5267... (Signer): ${ethers.utils.formatUnits(bal1, 6)} USDC.e`);
    console.log(`Balance 0x49CF... (User):   ${ethers.utils.formatUnits(bal2, 6)} USDC.e`);
}

run().catch(console.error);

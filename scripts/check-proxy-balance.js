const { ethers } = require('ethers');
require('dotenv').config();

const PROXY = '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b'.toLowerCase();
const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const contract = new ethers.Contract(USDC_E, abi, provider);

    console.log(`Checking USDC.e balance for Proxy: ${PROXY}`);
    const balance = await contract.balanceOf(PROXY);
    console.log(`Balance: ${ethers.utils.formatUnits(balance, 6)} USDC.e`);
}

run();

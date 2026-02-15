import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const feeData = await provider.getFeeData();
    console.log('--- Polygon Gas Prices ---');
    console.log(`Max Fee:      ${ethers.utils.formatUnits(feeData.maxFeePerGas || 0, 'gwei')} gwei`);
    console.log(`Max Priority: ${ethers.utils.formatUnits(feeData.maxPriorityFeePerGas || 0, 'gwei')} gwei`);
    console.log(`Gas Price:    ${ethers.utils.formatUnits(feeData.gasPrice || 0, 'gwei')} gwei`);
}

run();

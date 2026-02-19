const { ethers } = require('ethers');
require('dotenv').config();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const txHash = '0x81fc00fa6af132cc043dcf45b1d6e4f37b93104a8c6f09cd9f969728e7e6a2ca';

    console.log(`Listing log addresses for Tx: ${txHash}...`);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return;

    const addresses = new Set();
    receipt.logs.forEach(log => addresses.add(log.address));

    console.log("\nAddresses in logs:");
    addresses.forEach(addr => console.log(`- ${addr}`));
}

run();

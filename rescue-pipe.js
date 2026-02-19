const { ethers } = require('ethers');
require('dotenv').config();

async function rescue() {
    console.log('--- STARTING WALLET RESCUE (UNBLOCK PIPE) ---');

    const rpcUrl = process.env.RPC_URL || 'https://polygon.drpc.org';
    const privateKey = process.env.PRIVATE_KEY;

    if (!privateKey) {
        console.error('❌ Error: PRIVATE_KEY not found in .env');
        return;
    }

    const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, { name: 'polygon', chainId: 137 });
    const signer = new ethers.Wallet(privateKey, provider);

    const confirmedNonce = await provider.getTransactionCount(signer.address);
    const pendingNonce = await provider.getTransactionCount(signer.address, 'pending');

    console.log(`Address: ${signer.address}`);
    console.log(`Confirmed Nonce: ${confirmedNonce}`);
    console.log(`Pending Nonce: ${pendingNonce}`);
    console.log(`Backlog: ${pendingNonce - confirmedNonce} transactions`);

    if (pendingNonce <= confirmedNonce) {
        console.log('✅ Your wallet is not blocked. No pending transactions found.');
        return;
    }

    console.log(`\nAttempting to UNBLOCK the pipe starting at Nonce: ${confirmedNonce}...`);

    try {
        const gasData = await provider.getFeeData();
        // Use a very high tip and max fee to ensure it passes
        const maxPriorityFee = ethers.utils.parseUnits('150', 'gwei'); // 150 Gwei tip
        const maxFee = ethers.utils.parseUnits('600', 'gwei'); // 600 Gwei max

        console.log(`Sending a "Push" transaction (self-transfer 0 MATIC) with high gas:`);
        console.log(`Tip: 150 Gwei | Max: 600 Gwei`);

        const tx = await signer.sendTransaction({
            to: signer.address,
            value: 0,
            nonce: confirmedNonce,
            maxPriorityFeePerGas: maxPriorityFee,
            maxFeePerGas: maxFee,
            gasLimit: 21000
        });

        console.log(`\n🚀 Rescue Tx sent! Hash: ${tx.hash}`);
        console.log('Waiting for confirmation... this should clear the FIRST bottleneck.');

        const receipt = await tx.wait(1);
        console.log(`✅ Success! Block: ${receipt.blockNumber}`);
        console.log('The "pipe" should begin to move now. Run this script again if there is another bottleneck.');

    } catch (error) {
        console.error(`❌ Failed to send rescue tx: ${error.message}`);
    }
}

rescue();

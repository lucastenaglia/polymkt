import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const EOA = '0x52676040D122524DbB9D7bc1FF9764a1027a9897';

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const abi = ["event Transfer(address indexed from, address indexed to, uint256 value)"];
    const contract = new ethers.Contract(USDC_E, abi, provider);

    const filter = contract.filters.Transfer(EOA);
    // We'll check the last 10000 blocks (~6 hours)
    const latest = await provider.getBlockNumber();
    const fromBlock = latest - 10000;

    console.log(`Checking USDC.e transfers from ${EOA} starting block ${fromBlock}...`);
    const logs = await provider.getLogs({
        ...filter,
        fromBlock,
        toBlock: 'latest'
    });

    console.log(`Transactions found: ${logs.length}`);
    let total = 0;
    for (const log of logs) {
        const parsed = contract.interface.parseLog(log);
        const value = ethers.utils.formatUnits(parsed.args.value, 6);
        console.log(`- Block ${log.blockNumber}: Sent ${value} USDC.e to ${parsed.args.to} (Tx: ${log.transactionHash})`);
        total += parseFloat(value);
    }
    console.log(`\nTotal USDC.e out in last ~6h: ${total.toFixed(2)}`);
}

run().catch(console.error);

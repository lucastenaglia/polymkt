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
    const logs = await provider.getLogs({
        ...filter,
        fromBlock: 83000000,
        toBlock: 'latest'
    });

    console.log(`Found ${logs.length} outgoing transfers log for ${EOA}:`);
    let totalSent = 0;

    for (const log of logs) {
        const parsed = contract.interface.parseLog(log);
        const to = parsed.args.to;
        const value = ethers.utils.formatUnits(parsed.args.value, 6);
        console.log(`- Sent ${value} USDC.e to ${to} in tx ${log.transactionHash}`);
        totalSent += parseFloat(value);
    }

    console.log(`\nTotal Sent: ${totalSent} USDC.e`);
}

run().catch(console.error);

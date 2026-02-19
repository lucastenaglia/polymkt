import { ethers } from 'ethers';
import { CTF_EXCHANGE_ABI } from '../src/abi';

const RPC = "https://polygon-rpc.com";
const EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const INTERFACE = new ethers.utils.Interface(CTF_EXCHANGE_ABI);

async function main() {
    const user = process.argv[2];
    if (!user) {
        console.log("Usage: npx ts-node scripts/check-chain.ts <address>");
        return;
    }

    const provider = new ethers.providers.JsonRpcProvider(RPC);
    const endBlock = await provider.getBlockNumber();
    const startBlock = endBlock - 30; // Scan last 30 blocks for speed and RPC limits

    console.log(`Scanning ${user} from block ${startBlock} to ${endBlock}...`);

    const filter = {
        address: EXCHANGE,
        fromBlock: startBlock,
        toBlock: endBlock,
        topics: [ethers.utils.id("OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)")]
    };

    const logs = await provider.getLogs(filter);
    console.log(`Found ${logs.length} total fills in ${endBlock - startBlock} blocks.`);

    for (const log of logs) {
        try {
            const parsed = INTERFACE.parseLog(log);
            const { maker, taker, makerAssetId, takerAssetId } = parsed.args;

            if (maker.toLowerCase() === user.toLowerCase() || taker.toLowerCase() === user.toLowerCase()) {
                const isMaker = maker.toLowerCase() === user.toLowerCase();
                const spentId = isMaker ? makerAssetId : takerAssetId;
                const side = spentId.toString() === '0' ? 'BUY' : 'SELL';

                console.log(`[TARGET] TX: ${log.transactionHash.substring(0, 10)}... | Side: ${side} | UserRole: ${isMaker ? 'Maker' : 'Taker'}`);
            }
        } catch (e) { }
    }
}

main();

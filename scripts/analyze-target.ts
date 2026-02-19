import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const TARGET = '0x1979ae6B7E6534dE9c4539D0c205E582cA637C9D'.toLowerCase();
const TOPIC = ethers.utils.id("OrderFilled(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256,address,address,uint256)");

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const logs = await provider.getLogs({
        address: CTF_EXCHANGE,
        topics: [TOPIC],
        fromBlock: 83002580,
        toBlock: 83002590
    });

    console.log(`Found ${logs.length} fills total in block range.`);
    let targetFills = 0;

    for (const log of logs) {
        // Topic 1 and 2 are maker/taker? Let's check Abi.
        // Actually, maker/taker are indexed addresses.
        // Let's use Interface.
        const ABI = ["event OrderFilled(bytes32 conditionId, bytes32 tokenId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 makerFee, uint256 takerFee, uint256 salt, address indexed maker, address indexed taker, uint256 makerAssetId)"];
        const iface = new ethers.utils.Interface(ABI);
        const parsed = iface.parseLog(log);

        if (parsed.args.maker.toLowerCase() === TARGET) {
            targetFills++;
            console.log(`- Target acted as Maker in tx ${log.transactionHash}`);
        }
        if (parsed.args.taker.toLowerCase() === TARGET) {
            targetFills++;
            console.log(`- Target acted as Taker in tx ${log.transactionHash}`);
        }
    }

    console.log(`\nTarget fills in these 100 blocks: ${targetFills}`);
}

run().catch(console.error);

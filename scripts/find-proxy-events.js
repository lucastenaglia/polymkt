const { ethers } = require('ethers');
require('dotenv').config();

const FACTORY = '0xaebc4787d1bd97acc3353599908de16335198e3b';
const ABI = ["event ProxyCreated(address indexed creator, address proxy)"];
const EOA = '0x52676040D122524DbB9D7bc1FF9764a1027a9897';

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const contract = new ethers.Contract(FACTORY, ABI, provider);

    console.log(`Searching for ProxyCreated events for ${EOA} on Factory ${FACTORY}...`);

    // We'll search in chunks or just recent if possible, but let's try the whole range (last 1M blocks ~3 weeks)
    const latest = await provider.getBlockNumber();
    const filter = contract.filters.ProxyCreated(EOA);

    try {
        const logs = await provider.getLogs({
            ...filter,
            fromBlock: latest - 1000000,
            toBlock: 'latest'
        });

        console.log(`Found ${logs.length} events.`);
        logs.forEach(log => {
            const parsed = contract.interface.parseLog(log);
            console.log(`✅ Proxy found: ${parsed.args.proxy} (Created in block ${log.blockNumber})`);
        });

        if (logs.length === 0) {
            console.log("No proxy events found in the last ~3 weeks.");
        }
    } catch (e) {
        console.error("Error searching logs:", e.message);
    }
}

run();

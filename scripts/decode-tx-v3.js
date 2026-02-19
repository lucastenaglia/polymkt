const { ethers } = require('ethers');
require('dotenv').config();

const CT_ADDR = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'; // Correct address found in logs
const EOA = '0x52676040D122524DbB9D7bc1FF9764a1027a9897'.toLowerCase();

const ABI = [
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)"
];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const txHash = '0x81fc00fa6af132cc043dcf45b1d6e4f37b93104a8c6f09cd9f969728e7e6a2ca';

    console.log(`Decoding ERC1155 logs with Correct Addr: ${CT_ADDR}...`);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return;

    const iface = new ethers.utils.Interface(ABI);

    receipt.logs.forEach((log, i) => {
        if (log.address.toLowerCase() === CT_ADDR.toLowerCase()) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed.name === 'TransferSingle') {
                    const { from, to, id, value } = parsed.args;
                    if (to.toLowerCase() === EOA) {
                        console.log(`✅ RECEIVED ${value.toString()} units of Token ID ${id.toString()} in Log ${i}`);
                    }
                } else if (parsed.name === 'TransferBatch') {
                    const { from, to, ids, values } = parsed.args;
                    if (to.toLowerCase() === EOA) {
                        ids.forEach((id, j) => {
                            console.log(`✅ BATCH RECEIVED ${values[j].toString()} units of Token ID ${id.toString()} in Log ${i}`);
                        });
                    }
                }
            } catch (e) { }
        }
    });

    console.log("\nInspection complete.");
}

run();

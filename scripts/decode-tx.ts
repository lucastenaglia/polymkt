import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const CT_ADDR = '0x4D97022f18f36f23984d02421379963333333333';
const EOA = '0x52676040D122524DbB9D7bc1FF9764a1027a9897'.toLowerCase();

const ABI = [
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)"
];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const txHash = '0x81fc00fa6af132cc043dcf45b1d6e4f37b93104a8c6f09cd9f969728e7e6a2ca';

    console.log(`Decoding ERC1155 logs for Tx: ${txHash}...`);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return;

    const iface = new ethers.utils.Interface(ABI);

    receipt.logs.forEach((log) => {
        if (log.address.toLowerCase() === CT_ADDR.toLowerCase()) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed.name === 'TransferSingle') {
                    const { from, to, id, value } = parsed.args;
                    if (to.toLowerCase() === EOA) {
                        console.log(`✅ RECEIVED ${value.toString()} shares of Token ID ${id.toString()}`);
                    }
                } else if (parsed.name === 'TransferBatch') {
                    const { from, to, ids, values } = parsed.args;
                    if (to.toLowerCase() === EOA) {
                        ids.forEach((id: any, i: number) => {
                            console.log(`✅ BATCH RECEIVED ${values[i].toString()} shares of Token ID ${id.toString()}`);
                        });
                    }
                }
            } catch (e) { }
        }
    });

    console.log("\nInspection complete.");
}

run().catch(console.error);

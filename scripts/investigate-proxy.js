const { ethers } = require('ethers');
require('dotenv').config();

const PROXY = '0x15A3215842B12b1986530a775433ceB501869324'.toLowerCase();
const EOA = '0x52676040D122524DbB9D7bc1FF9764a1027a9897'.toLowerCase();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');

    console.log(`Checking address: ${PROXY}`);
    const code = await provider.getCode(PROXY);
    console.log(`Code length: ${code.length}`);

    if (code === '0x') {
        console.log("❌ This is NOT a contract.");
    } else {
        console.log("✅ This IS a contract.");

        // Check for owner() or getOwner() if it is a CtfProxy or Gnosis Safe
        const abi = [
            "function owner() view returns (address)",
            "function getOwners() view returns (address[])"
        ];
        const contract = new ethers.Contract(PROXY, abi, provider);

        try {
            const owner = await contract.owner();
            console.log(`Owner: ${owner}`);
            if (owner.toLowerCase() === EOA.toLowerCase()) {
                console.log("🎯 MATCH! This is the user's Proxy.");
            }
        } catch (e) {
            try {
                const owners = await contract.getOwners();
                console.log(`Owners: ${owners.join(', ')}`);
                if (owners.some(o => o.toLowerCase() === EOA.toLowerCase())) {
                    console.log("🎯 MATCH! This is the user's Gnosis Safe.");
                }
            } catch (e2) {
                console.log("Could not determine owner via standard functions.");
            }
        }
    }
}

run();

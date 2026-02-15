const { ethers } = require('ethers');
require('dotenv').config();

const CANDIDATE = '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b'.toLowerCase();
const EOA = '0x52676040D122524DbB9D7bc1FF9764a1027a9897'.toLowerCase();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');

    console.log(`Checking address: ${CANDIDATE}`);
    const code = await provider.getCode(CANDIDATE);
    console.log(`Code length: ${code.length}`);

    if (code === '0x') {
        console.log("❌ This is NOT a contract (It is an EOA).");
    } else {
        console.log("✅ This IS a contract (Likely a Proxy).");

        const abi = [
            "function owner() view returns (address)",
            "function getOwners() view returns (address[])"
        ];
        const contract = new ethers.Contract(CANDIDATE, abi, provider);

        try {
            const owner = await contract.owner();
            console.log(`Owner: ${owner}`);
            if (owner.toLowerCase() === EOA) {
                console.log("🎯 MATCH! This is the user's Proxy.");
            }
        } catch (e) {
            try {
                const owners = await contract.getOwners();
                console.log(`Owners: ${owners.join(', ')}`);
                if (owners.some(o => o.toLowerCase() === EOA)) {
                    console.log("🎯 MATCH! This is the user's Gnosis Safe.");
                }
            } catch (e2) {
                console.log("Could not determine owner via standard functions.");
            }
        }
    }
}

run();

const { ethers } = require('ethers');
require('dotenv').config();

const EOA = '0x52676040D122524DbB9D7bc1FF9764a1027a9897';
const FACTORY = '0x0217C2f9901599999bA45822bA45dEde2dD2d2D2';
const ABI = ["function proxyFor(address) view returns (address)"];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const contract = new ethers.Contract(FACTORY, ABI, provider);

    console.log(`Checking Profile Factory ${FACTORY} for EOA ${EOA}...`);
    try {
        const proxy = await contract.proxyFor(EOA);
        console.log(`✅ Proxy found: ${proxy}`);
    } catch (e) {
        console.error(`❌ Error logic: ${e.message}`);
    }
}

run();

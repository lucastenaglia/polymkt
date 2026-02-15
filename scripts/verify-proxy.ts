import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const FACTORIES = [
    '0xaebc4787d1bd97acc3353599908de16335198e3b', // CtfProxyFactory (Old/Standard)
    '0xaacfeea03eb1561c4e67d661e40682bd20e3541b', // Gnosis Safe Factory
];
const F_ABI = ["function proxyFor(address) view returns (address)"];
const EOA = '0x52676040D122524DbB9D7bc1FF9764a1027a9897';

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');

    console.log(`Checking factories for EOA: ${EOA}`);

    for (const factoryAddr of FACTORIES) {
        try {
            const factory = new ethers.Contract(factoryAddr, F_ABI, provider);
            const proxy = await factory.proxyFor(EOA);
            console.log(`Factory ${factoryAddr}: Proxy = ${proxy}`);
        } catch (e: any) {
            console.log(`Factory ${factoryAddr}: Error = ${e.message}`);
        }
    }
}

run().catch(console.error);

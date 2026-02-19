import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const RAW_PROXY_ADDR = '0x15A3215842B12b1986530a775433ceB501869324';

const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];

async function run() {
    console.log('--- STARTING MANUAL APPROVAL ---');
    if (!process.env.PRIVATE_KEY) {
        console.error('PRIVATE_KEY MISSING');
        return;
    }

    const RPC = process.env.RPC_URL || 'https://polygon-rpc.com';
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // Robust address handling
    const PROXY_ADDR = ethers.utils.getAddress(RAW_PROXY_ADDR.toLowerCase());
    const SPENDER = ethers.utils.getAddress(CTF_EXCHANGE.toLowerCase());
    const TOKEN = ethers.utils.getAddress(USDC_E.toLowerCase());

    console.log(`EOA:   ${signer.address}`);
    console.log(`Proxy: ${PROXY_ADDR}`);
    console.log(`Spender: ${SPENDER}`);

    const code = await provider.getCode(PROXY_ADDR);
    console.log(`Proxy Code length: ${code.length}`);
    if (code === '0x') {
        console.error('❌ Proxy has no code.');
        return;
    }

    const iface = new ethers.utils.Interface(["function proxy(address dest, bytes data) external returns (bytes)"]);
    const erc20 = new ethers.utils.Interface(ERC20_ABI);
    const data = erc20.encodeFunctionData("approve", [SPENDER, ethers.constants.MaxUint256]);
    const callData = iface.encodeFunctionData("proxy", [TOKEN, data]);

    console.log('Sending transaction via Proxy...');
    try {
        const tx = await signer.sendTransaction({
            to: PROXY_ADDR,
            data: callData,
            gasLimit: 300000
        });
        console.log(`Tx sent: ${tx.hash}`);
        console.log('Waiting for confirmation...');
        await tx.wait();
        console.log('✅ SUCCESS! Allowance should be set.');
    } catch (e: any) {
        console.error(`❌ FAILED: ${e.message}`);
        if (e.data) console.log('Error Data:', e.data);
    }
}

run().catch(console.error);

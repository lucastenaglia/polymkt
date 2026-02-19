import { ClobClient, AssetType } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

    // Fix checksums
    const EOA = ethers.utils.getAddress(signer.address.toLowerCase());
    const PROXY = ethers.utils.getAddress('0x15A3215842B12b1986530a775433ceB501869324'.toLowerCase());
    const USDC_E = ethers.utils.getAddress('0x2791bca1f2de4661ed88a30c99a7a9449aa84174'.toLowerCase());

    console.log('--- DEFINITIVE RAW CHECK ---');
    console.log('Signer (EOA):', EOA);
    console.log('Proxy:', PROXY);

    // 1. Direct On-Chain Check
    const erc20 = new ethers.Contract(USDC_E, ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"], provider);
    const CTF_EXCHANGE = ethers.utils.getAddress('0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'.toLowerCase());

    const eoaBal = await erc20.balanceOf(EOA);
    const proxyBal = await erc20.balanceOf(PROXY);
    const eoaAll = await erc20.allowance(EOA, CTF_EXCHANGE);
    const proxyAll = await erc20.allowance(PROXY, CTF_EXCHANGE);

    console.log(`\n[ON-CHAIN]`);
    console.log(`EOA Balance:     ${ethers.utils.formatUnits(eoaBal, 6)} USDC.e`);
    console.log(`EOA Allowance:   ${ethers.utils.formatUnits(eoaAll, 6)} (to CTF Exchange)`);
    console.log(`Proxy Balance:   ${ethers.utils.formatUnits(proxyBal, 6)} USDC.e`);
    console.log(`Proxy Allowance: ${ethers.utils.formatUnits(proxyAll, 6)} (to CTF Exchange)`);

    // 2. SDK Check (What the CLOB API sees)
    console.log('\n--- SDK/API CHECK ---');
    const clientEOA = new ClobClient(process.env.CLOB_API_URL!, 137, signer, undefined, SignatureType.EOA);
    try {
        const bal = await clientEOA.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
        console.log('SDK EOA Sees:', JSON.stringify(bal, null, 2));
    } catch (e: any) {
        console.error('SDK EOA Check Failed:', e.message);
    }

    const clientProxy = new ClobClient(process.env.CLOB_API_URL!, 137, signer, undefined, SignatureType.POLY_PROXY, PROXY);
    try {
        const bal = await clientProxy.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
        console.log('SDK Proxy Sees:', JSON.stringify(bal, null, 2));
    } catch (e: any) {
        console.error('SDK Proxy Check Failed:', e.message);
    }
}

run().catch(console.error);

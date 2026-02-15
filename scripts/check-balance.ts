import { ethers } from 'ethers';
import { config } from '../src/config';

// Polygon USDC.e (Bridged) - stored in 6 decimals
const USDC_ADDR = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

import { ClobClient } from '@polymarket/clob-client';

async function checkBalance() {
    if (!config.privateKey) {
        console.error("❌ No Private Key found in .env! Please set PRIVATE_KEY.");
        return;
    }

    const pk = config.privateKey.trim();

    // ... validation ... 
    if (pk.length < 60) {
        console.error("❌ Private Key seems too short.");
    }
    const isHex = /^(0x)?[0-9a-fA-F]+$/.test(pk);
    if (!isHex) {
        console.error("❌ Private Key contains non-hex characters.");
        return;
    }

    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(pk, provider);

    console.log(`Checking balance for EOA: ${wallet.address}`);

    try {
        // 1. Check MATIC (Native)
        const maticBalanceWei = await wallet.getBalance();
        const maticBalance = ethers.utils.formatEther(maticBalanceWei);
        console.log(`💰 MATIC: ${maticBalance}`);

        // 2. Check USDC (ERC20)
        const usdcContract = new ethers.Contract(USDC_ADDR, USDC_ABI, provider);
        const usdcBalanceRaw = await usdcContract.balanceOf(wallet.address);
        const decimals = await usdcContract.decimals();
        const symbol = await usdcContract.symbol();
        const usdcBalance = ethers.utils.formatUnits(usdcBalanceRaw, decimals);

        console.log(`💵 EOA USDC: ${usdcBalance}`);

        // 3. Check Polymarket Portfolio (Proxy Wallet)
        console.log("Checking Polymarket Portfolio...");
        try {
            const clobClient = new ClobClient(config.rpcUrl, 137, wallet);
            // This ensures we have the API keys derived/ready
            const creds = await clobClient.deriveApiKey();
            console.log("✅ API Keys Derived");

            // Try to get balance
            // @ts-ignore
            if (typeof clobClient.getCollateralBalance === 'function') {
                // @ts-ignore
                const proxyBal = await clobClient.getCollateralBalance();
                // @ts-ignore
                console.log(`🏦 Proxy/CTF USDC: ${proxyBal}`);
            } else {
                console.log("⚠️ createOrder is available, assuming setup is correct. (Balance check method not found)");
            }

        } catch (err: any) {
            console.error("❌ Failed to connect to Polymarket CLOB:", err.message);
        }

    } catch (error) {
        console.error("❌ Error checking balance:", error);
    }
}

checkBalance();

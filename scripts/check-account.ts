import { ClobClient, AssetType } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';

const ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address, address) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

async function check() {
    console.log('--- Account Verification ---');

    // 1. Get address from Private Key
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-bor-rpc.publicnode.com');
    let signer;
    const pk = process.env.PRIVATE_KEY;
    if (pk && pk.startsWith('0x') && pk.length > 40) {
        signer = new ethers.Wallet(pk, provider);
        console.log('EOA Address (from Private Key):', signer.address);
    } else {
        console.warn('⚠️ No valid PRIVATE_KEY found in .env. Using a dummy signer for API check.');
        signer = ethers.Wallet.createRandom().connect(provider);
    }

    const OTHER_ADDRESS = '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b';

    // 2. Check Balance via API Key
    const client = new ClobClient(
        process.env.CLOB_API_URL || 'https://clob.polymarket.com',
        137,
        signer,
        {
            key: process.env.POLY_API_KEY!,
            secret: process.env.POLY_SECRET!,
            passphrase: process.env.POLY_PASSPHRASE!
        }
    );

    try {
        const bal = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
        console.log('✅ Balance/Allowance via API:', JSON.stringify(bal, null, 2));
    } catch (e: any) {
        console.error('❌ API Balance Check Failed (Mismatch between Key and Address?):', e.message);
    }

    // 3. Check On-Chain (USDC.e and native USDC)
    const USDC_NATIVE = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
    const usdcE = new ethers.Contract(USDC_E, ABI, provider);
    const usdcN = new ethers.Contract(USDC_NATIVE, ABI, provider);

    const factoryAddr = '0xaebc4787d1bd97acc3353599908de16335198e3b';
    const factoryAbi = ["function proxyFor(address) view returns (address)"];
    const factory = new ethers.Contract(factoryAddr, factoryAbi, provider);

    async function checkAddr(addr: string, label: string) {
        console.log(`\n--- ${label}: ${addr} ---`);
        const bE = await usdcE.balanceOf(addr);
        const bN = await usdcN.balanceOf(addr);
        const dec = await usdcE.decimals();
        console.log(`USDC.e (Bridged): ${ethers.utils.formatUnits(bE, dec)}`);
        console.log(`USDC (Native):  ${ethers.utils.formatUnits(bN, dec)}`);

        try {
            const proxy = await factory.proxyFor(addr);
            if (proxy !== ethers.constants.AddressZero) {
                console.log(`Found Proxy: ${proxy}`);
                const pbE = await usdcE.balanceOf(proxy);
                const pbN = await usdcN.balanceOf(proxy);
                console.log(`  PROXY USDC.e: ${ethers.utils.formatUnits(pbE, dec)}`);
                console.log(`  PROXY USDC:   ${ethers.utils.formatUnits(pbN, dec)}`);
            }
        } catch (e) { }
    }

    await checkAddr(signer.address, 'CONFIGURED WALLET (Bot)');
    await checkAddr(OTHER_ADDRESS, 'TARGET ADDRESS (User Profile)');
}

check();

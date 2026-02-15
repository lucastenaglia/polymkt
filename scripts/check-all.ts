import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const USDC_N = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const FACTORY = '0xaebc4787d1bd97acc3353599908de16335198e3b';

const ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
const F_ABI = ["function proxyFor(address) view returns (address)"];

async function run() {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');
    const usdcE = new ethers.Contract(USDC_E, ABI, provider);
    const usdcN = new ethers.Contract(USDC_N, ABI, provider);
    const factory = new ethers.Contract(FACTORY, F_ABI, provider);

    const accounts = [
        { addr: '0x52676040D122524DbB9D7bc1FF9764a1027a9897', label: 'BILLETERA BOT (Phantom)' },
        { addr: '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b', label: 'CUENTA USER (Polymarket)' }
    ];

    console.log('\n--- DIAGNÓSTICO DE BALANCES ---');

    for (const acc of accounts) {
        console.log(`\n> ${acc.label} (${acc.addr})`);

        const matic = await provider.getBalance(acc.addr);
        const be = await usdcE.balanceOf(acc.addr);
        const bn = await usdcN.balanceOf(acc.addr);

        console.log(`  EOA MATIC:         ${ethers.utils.formatEther(matic)}`);
        console.log(`  EOA USDC.e (Bridged): ${ethers.utils.formatUnits(be, 6)}`);
        console.log(`  EOA USDC (Native):    ${ethers.utils.formatUnits(bn, 6)}`);

        try {
            const proxy = await factory.proxyFor(acc.addr);
            if (proxy !== ethers.constants.AddressZero) {
                const pbe = await usdcE.balanceOf(proxy);
                const pbn = await usdcN.balanceOf(proxy);
                console.log(`  PROXY (${proxy}):`);
                console.log(`    USDC.e: ${ethers.utils.formatUnits(pbe, 6)}`);
                console.log(`    USDC:   ${ethers.utils.formatUnits(pbn, 6)}`);
            }
        } catch (e) { }
    }
}

run();

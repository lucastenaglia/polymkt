const { ethers } = require('ethers');

const RPC_URL = 'https://polygon-bor-rpc.publicnode.com';
const EOA = '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b';
const USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'; // Native USDC
const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'; // Bridged USDC.e

const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

const ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address, address) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

async function check() {
    console.log('--- Checking:', EOA, '---');
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

    const tokens = [
        { name: 'Native USDC', address: USDC },
        { name: 'Bridged USDC.e', address: USDC_E }
    ];

    for (const t of tokens) {
        const contract = new ethers.Contract(t.address, ABI, provider);
        const bal = await contract.balanceOf(EOA);
        const allow = await contract.allowance(EOA, CTF_EXCHANGE);
        const dec = await contract.decimals();
        console.log(`${t.name}: Bal: ${ethers.utils.formatUnits(bal, dec)}, Allow: ${ethers.utils.formatUnits(allow, dec)}`);
    }

    // Try to find proxy via known factory or common patterns
    // Polymarket uses a ProxyFactory at 0xaEBC4787D1bD97Acc3353599908de16335198E3b
    const factoryAddr = '0xaebc4787d1bd97acc3353599908de16335198e3b';
    const factoryAbi = ["function proxyFor(address) view returns (address)"];
    const factory = new ethers.Contract(factoryAddr, factoryAbi, provider);

    try {
        const proxy = await factory.proxyFor(EOA);
        console.log('\n--- Found Proxy Wallet:', proxy, '---');
        if (proxy !== ethers.constants.AddressZero) {
            for (const t of tokens) {
                const contract = new ethers.Contract(t.address, ABI, provider);
                const bal = await contract.balanceOf(proxy);
                const allow = await contract.allowance(proxy, CTF_EXCHANGE);
                const dec = await contract.decimals();
                console.log(`${t.name}: Bal: ${ethers.utils.formatUnits(bal, dec)}, Allow: ${ethers.utils.formatUnits(allow, dec)}`);
            }
        }
    } catch (e) {
        console.log('\nCould not find proxy via factory:', e.message);
    }
}

check();

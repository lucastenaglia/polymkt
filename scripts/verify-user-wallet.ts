import { ethers } from 'ethers';

const RPC_URL = 'https://polygon-bor-rpc.publicnode.com';
const TARGET_ADDRESS = '0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b';

const USDC_NATIVE = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';

const ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];

async function check() {
    console.log('Verifying balances for user address:', TARGET_ADDRESS);
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

    try {
        const matic = await provider.getBalance(TARGET_ADDRESS);
        console.log('Native MATIC:', ethers.utils.formatEther(matic));

        for (const token of [USDC_NATIVE, USDC_E]) {
            const contract = new ethers.Contract(token, ABI, provider);
            try {
                const bal = await contract.balanceOf(TARGET_ADDRESS);
                const dec = await contract.decimals();
                console.log(`Token ${token === USDC_NATIVE ? '(Native)' : '(Bridged)'} ${token}: ${ethers.utils.formatUnits(bal, dec)}`);
            } catch (e: any) {
                console.error(`Error checking ${token}:`, e.message);
            }
        }
    } catch (err: any) {
        console.error('Core error:', err.message);
    }
}

check();

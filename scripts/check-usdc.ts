import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const PROXY = "0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b";
const RPC = "https://polygon-rpc.com";

async function check() {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    const erc20 = new ethers.Contract(USDC_E, ["function balanceOf(address) view returns (uint256)"], provider);

    const bal = await erc20.balanceOf(PROXY);
    console.log(`Proxy ${PROXY} USDC.e Balance: $${ethers.utils.formatUnits(bal, 6)}`);
}

check();

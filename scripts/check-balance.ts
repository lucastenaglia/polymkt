import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { CONDITIONAL_TOKENS_ABI } from '../src/abi';

dotenv.config();

const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const PROXY = "0x49CF8d56dFfaC0e6e0E8ABe70c605bf11a7E0f9b";
const RPC = "https://polygon-rpc.com";

async function check() {
    const provider = new ethers.providers.JsonRpcProvider(RPC);
    const ctf = new ethers.Contract(CTF, CONDITIONAL_TOKENS_ABI, provider);

    // Token IDs from logs
    const ids = [
        "2077190203464600902565435671056513681491397438145858116833822261219765973691",
        "50321401639280794332079098856566060695718647165467327290687188939911014501908",
        "97976693006985082827835994596059319553775700514787459898014961359842076013000",
        "54756173421078384014629518618194842052488995146219229104798588910643569098257"
    ];

    console.log(`Checking Proxy: ${PROXY}`);
    for (const id of ids) {
        const bal = await ctf.balanceOf(PROXY, id);
        console.log(`ID ${id.substring(0, 10)}... Balance: ${bal.toString()}`);
    }
}

check();

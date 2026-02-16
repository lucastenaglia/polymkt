import { sendErrorNotification } from '../src/telegram';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log('--- TESTING TELEGRAM SUPPRESSION ---');

    console.log('\n1. Testing "not enough balance" (Should be suppressed)...');
    await sendErrorNotification('PolyMarket API Error: not enough balance / allowance');

    console.log('\n2. Testing "allowance" (Should be suppressed)...');
    await sendErrorNotification('Insufficient allowance for trade');

    console.log('\n3. Testing "Unknown Error" (Should be SENT)...');
    await sendErrorNotification('Some unexpected API error 500');

    console.log('\nDone. Check your Telegram and console logs.');
}

test();


import { sendTradeNotification, sendErrorNotification } from '../src/telegram';
import { TradeNotificationData } from '../src/types';
import { config } from '../src/config';

console.log('Testing Telegram Notification...');
console.log('Token:', config.telegramToken ? 'OK' : 'MISSING');
console.log('ChatID:', config.telegramChatId ? config.telegramChatId : 'MISSING');

async function test() {
    const mockTrade: TradeNotificationData = {
        targetUser: '0x1979ae6B7E6534dE9c4539D0c205E582cA637C9D',
        targetName: '0x1979',
        marketSlug: 'test-market-slug',
        marketId: '0x123456789',
        side: 'BUY',
        outcome: 'Yes',
        amountUsd: 1.0,
        price: 0.50,
        txHash: '0xmocktxhash',
        newBalance: '15.00 USDC'
    };

    console.log('Sending mock trade notification...');
    await sendTradeNotification(mockTrade);

    console.log('Sending mock error notification...');
    await sendErrorNotification('This is a test error from the debug script.');
}

test();

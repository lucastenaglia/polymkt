import { sendTradeNotification } from '../src/telegram';

async function testTelegram() {
    console.log('Sending test message to Telegram...');

    const dummyData = {
        targetUser: '0x1234567890abcdef1234567890abcdef12345678',
        marketSlug: 'will-btc-hit-100k-in-2024',
        marketId: '0x123',
        side: 'BUY',
        outcome: 'YES',
        amountUsd: 10.00,
        price: '0.55',
        txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        newBalance: '100.00'
    };

    try {
        await sendTradeNotification(dummyData);
        console.log('Message sent! Check your Telegram.');
    } catch (error) {
        console.error('Failed to send message:', error);
    }
}

testTelegram();

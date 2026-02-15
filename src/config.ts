import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
    privateKey: process.env.PRIVATE_KEY || '',
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    rpcUrl: process.env.RPC_URL || 'https://polygon-rpc.com',
    clobApiUrl: process.env.CLOB_API_URL || 'https://clob.polymarket.com',
    targetUsers: (process.env.TARGET_USERS || '').split(',').map(u => u.trim()).filter(u => u),
    maxPositionSizeUsd: parseFloat(process.env.MAX_POSITION_SIZE_USD || '1.0'),
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '6000', 10),
    polymktApiKey: process.env.POLY_API_KEY || '',
    polymktSecret: process.env.POLY_SECRET || '',
    polymktPassphrase: process.env.POLY_PASSPHRASE || '',
    proxyAddress: process.env.PROXY_ADDRESS || '',
};

if (!config.privateKey) {
    console.warn("WARNING: PRIVATE_KEY is not set in .env");
}

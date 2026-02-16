import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { getBalances } from './trader';
import { getOpenPositions, getClosedPositions } from './db';
import { Position, TradeNotificationData } from './types';

// Initialize bot with polling disabled by default
const bot = new TelegramBot(config.telegramToken, { polling: false });

// Handle Polling Errors (silence EFATAL noise)
bot.on('polling_error', (error: any) => {
    const msg = error.message || error;
    if (error.code === 'EFATAL' || error.code === 'ETIMEDOUT' || msg.includes('AggregateError') || msg.includes('socket hang up') || msg.includes('timeout')) {
        return; // Silently ignore transient network/polling issues
    }
    console.error('Telegram Polling Error:', msg);
});

export async function startBot() {
    console.log('🤖 Telegram Bot Started');
    bot.startPolling();

    // Handle /start
    bot.onText(/\/start/, (msg: TelegramBot.Message) => {
        const chatId = msg.chat.id;
        if (config.telegramChatId && chatId.toString() !== config.telegramChatId) {
            bot.sendMessage(chatId, "⛔ Unauthorized.");
            return;
        }

        bot.sendMessage(chatId, "👋 Welcome! Choose an option:", {
            reply_markup: {
                keyboard: [
                    [{ text: "💰 Balance" }, { text: "💸 Claim" }],
                    [{ text: "🛑 STOP" }, { text: "▶️ START" }],
                    [{ text: "📈 Open Positions" }, { text: "📉 Closed Positions" }],
                    [{ text: "🚀 Cerrar Todo" }]
                ],
                resize_keyboard: true
            }
        });
    });

    // Handle Buttons
    bot.on('message', async (msg: TelegramBot.Message) => {
        const chatId = msg.chat.id;
        if (config.telegramChatId && chatId.toString() !== config.telegramChatId) return;

        const text = msg.text;

        if (text === "💰 Balance") {
            try {
                const balances = await getBalances();
                bot.sendMessage(chatId, `
💰 *Balance Check*
            
📊 *Portfolio*: $${balances.portfolio}
💵 *Cash*: $${balances.cash}
⛽ *Matic*: ${parseFloat(balances.matic).toFixed(4)}
                `, { parse_mode: 'Markdown' });
            } catch (e: any) {
                bot.sendMessage(chatId, `❌ Error: ${e.message}`);
            }
        }

        if (text === "📈 Open Positions") {
            try {
                const positions: Position[] = getOpenPositions();
                if (positions.length === 0) {
                    bot.sendMessage(chatId, "No open positions.");
                } else {
                    const total = positions.length;
                    const displayList = positions.slice(0, 20); // Limit to latest 20 to avoid Telegram message length limits

                    let msgText = `📈 *Active Copy Trades (${total} total)*:\n_Showing latest 20_\n\n`;
                    const { TARGET_NAMES } = require('./trader');

                    displayList.forEach((p: Position) => {
                        const targetLine = p.target_user ? (TARGET_NAMES[p.target_user.toLowerCase()] || p.target_user) : 'N/A';
                        // Basic escaping for target names that might be addresses or handles
                        const safeTarget = targetLine.replace(/[_*`]/g, '\\$&');
                        const outcome = (p.outcome || 'Unknown').replace(/[_*`]/g, '\\$&');
                        const amount = typeof p.amount === 'number' ? p.amount.toFixed(2) : p.amount;

                        msgText += `• ${outcome} | $${amount} | Target: ${safeTarget}\n`;
                    });

                    bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
                }
            } catch (e: any) {
                console.error('[TELEGRAM] Error in Open Positions:', e.message);
                bot.sendMessage(chatId, `❌ Error: ${e.message}`);
            }
        }

        if (text === "📉 Closed Positions") {
            try {
                const positions: Position[] = getClosedPositions();
                if (positions.length === 0) {
                    bot.sendMessage(chatId, "No closed positions.");
                } else {
                    let msgText = "📉 *Last 10 Closed Positions*:\n\n";
                    positions.forEach((p: Position) => {
                        const amount = typeof p.amount === 'number' ? p.amount.toFixed(2) : p.amount;
                        const outcome = (p.outcome || 'Unknown').replace(/[_*`]/g, '\\$&');
                        msgText += `• ${outcome} ($${amount})\n`;
                    });
                    bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
                }
            } catch (e: any) {
                bot.sendMessage(chatId, `❌ Error: ${e.message}`);
            }
        }

        if (text === "🚀 Cerrar Todo") {
            // Lazy import to avoid circular dependency if any
            const { closeAllPositions } = require('./trader');
            bot.sendMessage(chatId, "⏳ Iniciando liquidación de todas las posiciones...");
            try {
                const result = await closeAllPositions();
                bot.sendMessage(chatId, result);
            } catch (e: any) {
                bot.sendMessage(chatId, `❌ Error al cerrar: ${e.message}`);
            }
        }

        if (text === "💸 Claim") {
            const { claimPositions } = require('./trader');
            bot.sendMessage(chatId, "⏳ Buscando ganancias por cobrar...");
            try {
                const result = await claimPositions();
                bot.sendMessage(chatId, result);
            } catch (e: any) {
                bot.sendMessage(chatId, `❌ Error al cobrar: ${e.message}`);
            }
        }

        if (text === "🛑 STOP") {
            const { setPauseState } = require('./trader');
            setPauseState(true);
            bot.sendMessage(chatId, "🛑 Bot PAUSADO. No se abrirán nuevas posiciones ni se monitorearán nuevos eventos.");
        }

        if (text === "▶️ START") {
            const { setPauseState } = require('./trader');
            setPauseState(false);
            bot.sendMessage(chatId, "▶️ Bot ACTIVADO. Monitoreo y operaciones reanudadas.");
        }
    });
}

export async function sendTradeNotification(data: TradeNotificationData) {
    if (!config.telegramChatId) return;

    const targetDisplay = data.targetName ? `${data.targetName} (${data.targetUser})` : `\`${data.targetUser}\``;

    const message = `
🚨 *Copy Trade Executed* 🚨

👤 *Target*: ${targetDisplay}
📉 *Market*: ${data.marketSlug || data.marketId}
⚖️ *Side*: ${data.side} (${data.outcome})
💰 *Amount*: $${data.amountUsd}
💸 *Entry Price*: $${data.price}

💰 *Bot Balance*: ${data.newBalance}
`;

    try {
        await bot.sendMessage(config.telegramChatId, message, { parse_mode: 'Markdown' });
    } catch (error: any) {
        // Suppress timeout errors to prevent spam
        if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout') || error.message?.includes('socket hang up')) {
            console.warn('[TELEGRAM] Notification timed out (Message sent but not confirmed due to network lag).');
        } else {
            console.warn('[TELEGRAM] Failed to send notification:', error.message);
        }
    }
}

export async function sendErrorNotification(error: any) {
    if (!config.telegramChatId) return;
    try {
        const errorString = typeof error === 'string' ? error : (error?.message || JSON.stringify(error) || 'Unknown Error');
        // Prevent massive error spam
        if (errorString.includes('ETIMEDOUT') || errorString.includes('socket hang up')) return;
        if (errorString.toLowerCase().includes('not enough balance') || errorString.toLowerCase().includes('allowance')) {
            console.log('[TELEGRAM] Suppressed balance/allowance error notification.');
            return;
        }

        const text = `⚠️ *Error*: ${errorString.replace(/_/g, '\\_')}`; // Escape underscores
        await bot.sendMessage(config.telegramChatId, text, { parse_mode: 'Markdown' });
    } catch (e) {
        // Ignore failures to send error notifications
    }
}

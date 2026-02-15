export interface Position {
    market_id: string;
    outcome: string;
    amount: number;
    status: 'OPEN' | 'CLOSED';
    entry_price: number;
    timestamp: number;
    target_user?: string;
}

export interface TradeNotificationData {
    targetUser: string;
    targetName?: string;
    marketSlug?: string;
    marketId: string;
    side: string;
    outcome: string;
    amountUsd: number;
    price: string | number;
    txHash: string;
    newBalance: string;
}

export interface Balances {
    matic: string;
    cash: string;
    portfolio: string;
}

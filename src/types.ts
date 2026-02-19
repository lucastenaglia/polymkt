export interface Position {
    market_id: string;
    outcome: string;
    amount: number;
    status: 'OPEN' | 'CLOSED';
    entry_price: number;
    timestamp: number;
    target_user?: string;
    id?: number;
    asset_id?: string;
    slug?: string;
    exit_price?: number;
    pnl?: number;
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

export interface ClosedTradeNotificationData {
    targetUser: string;
    targetName?: string;
    marketSlug?: string;
    marketId: string;
    outcome: string;
    amountUsd: number;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercentage: number;
    status: 'WON' | 'LOST' | 'CLOSED';
}

export interface Balances {
    matic: string;
    cash: string;
    portfolio: string;
}

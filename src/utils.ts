import axios from 'axios';

// Cache for asset resolution
const assetCache = new Map<string, any>();

export async function resolveAsset(assetId: string) {
    if (assetCache.has(assetId)) {
        console.log(`[UTILS] Resolved asset ${assetId} from cache.`);
        return assetCache.get(assetId);
    }
    return null;
}

export function cacheMarket(assetId: string, marketData: any) {
    if (!assetCache.has(assetId)) {
        assetCache.set(assetId, marketData);
        // console.log(`[UTILS] Cached asset ${assetId} -> ${marketData.slug}`);
    }
}

import db, { getPositionByAssetId } from './db';

export async function getMarketFromUserPosition(user: string, assetId: string) {
    // 1. Check Cache
    const cached = await resolveAsset(assetId);
    if (cached) return cached;

    // 2. Check Local DB (INSTANT resolution for positions we already copied)
    const localPos = getPositionByAssetId(assetId);
    if (localPos) {
        console.log(`[UTILS] Resolved asset ${assetId} from local DB -> ${localPos.slug}`);
        const marketData = {
            marketId: localPos.market_id,
            outcome: localPos.outcome,
            slug: localPos.slug,
            assetId: assetId
        };
        cacheMarket(assetId, marketData);
        return marketData;
    }

    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
        try {
            if (i > 0) {
                console.log(`[UTILS] Resolution Retry ${i}/${maxRetries - 1} for ${assetId}...`);
                await new Promise(r => setTimeout(r, 4000));
            }

            // 3. Fallback: Check TRADES API (More reliable than /positions for sells)
            console.log(`[UTILS] Resolution attempt via Trades API for ${user}...`);
            const tradeUrl = `https://data-api.polymarket.com/trades?user=${user}&limit=10`;
            const tradeRes = await axios.get(tradeUrl);
            if (tradeRes.data && Array.isArray(tradeRes.data)) {
                // Trades API uses 'assetId' or similar. Let's check common keys.
                const match = tradeRes.data.find((t: any) => (t.assetId === assetId || t.asset === assetId || t.tokenID === assetId));
                if (match) {
                    console.log(`[UTILS] Resolved asset ${assetId} from Trades API -> ${match.slug}`);
                    const marketData = {
                        marketId: match.conditionId,
                        outcome: match.outcome,
                        slug: match.slug,
                        assetId: assetId
                    };
                    cacheMarket(assetId, marketData);
                    return marketData;
                }
            }

            // 4. Last Resort: Poll POSITIONS API
            const posUrl = `https://data-api.polymarket.com/positions?user=${user}`;
            const posRes = await axios.get(posUrl);
            if (posRes.data && Array.isArray(posRes.data)) {
                const match = posRes.data.find((p: any) => p.asset === assetId);
                if (match) {
                    const marketData = {
                        marketId: match.conditionId,
                        outcome: match.outcome,
                        slug: match.slug,
                        assetId: match.asset
                    };
                    cacheMarket(assetId, marketData);
                    return marketData;
                }
            }
        } catch (e: any) {
            console.error(`[UTILS] Error fetching activities (Attempt ${i + 1}):`, e.message);
        }
    }

    console.warn(`[UTILS] Failed to resolve asset ${assetId} after ${maxRetries} attempts.`);
    return null;
}

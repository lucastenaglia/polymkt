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

export async function getMarketFromUserPosition(user: string, assetId: string) {
    // 1. Check Cache
    const cached = await resolveAsset(assetId);
    if (cached) return cached;

    try {
        // Poll positions for this user
        // We know they JUST traded.
        const url = `https://data-api.polymarket.com/positions?user=${user}`;
        const res = await axios.get(url);
        if (res.data && Array.isArray(res.data)) {
            // Find position with matching asset ID or recent timestamp
            // The API returns 'asset' (token ID).
            const match = res.data.find((p: any) => p.asset === assetId);
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
    } catch (e) {
        console.error('Error fetching user positions for resolution:', e);
    }
    return null;
}

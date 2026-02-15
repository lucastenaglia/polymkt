import axios from 'axios';

// Cache for asset resolution
const assetCache = new Map<string, any>();

export async function resolveAsset(assetId: string) {
    if (assetCache.has(assetId)) return assetCache.get(assetId);

    // Use Gamma API or Data API to reverse lookup?
    // Data API 'GET /markets' returns tokenIds.
    // There isn't a direct "AssetID -> Market" endpoint usually documented publicly easily.
    // However, we can use GraphQL or just search.

    // Strategy: 
    // If we have the Market Condition ID, we can compute Asset IDs.
    // But we have the reverse.

    // Alternative:
    // Query Gamma API for *active* markets and cache their token IDs?
    // Or simpler: The `trade_detected` provided the user address.
    // We can query `GET /positions?user=TARGET` immediately.
    // The new position should be there!

    return null;
}

export async function getMarketFromUserPosition(user: string, assetId: string) {
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
                return {
                    marketId: match.conditionId,
                    outcome: match.outcome,
                    slug: match.slug,
                    assetId: match.asset
                };
            }
        }
    } catch (e) {
        console.error('Error fetching user positions for resolution:', e);
    }
    return null;
}

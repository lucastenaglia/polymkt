import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { config } from './config';
import db from './db';
import { CTF_EXCHANGE_ADDR_BINARY, CTF_EXCHANGE_ABI } from './abi';

export const monitorEvents = new EventEmitter();

// Use a reliable RPC
const PROVIDER = new ethers.providers.StaticJsonRpcProvider(config.rpcUrl, { name: 'polygon', chainId: 137 });
const INTERFACE = new ethers.utils.Interface(CTF_EXCHANGE_ABI);

// Topics for filtering
const ORDER_FILLED_TOPIC = ethers.utils.id("OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)");

let lastCheckedBlock = 0;

async function processLog(log: ethers.providers.Log) {
    try {
        const parsed = INTERFACE.parseLog(log);
        if (!parsed) return;

        const { maker, taker, makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled } = parsed.args;
        const orderHash = parsed.args[0];

        // Check if any target user is involved
        const makerMatch = config.targetUsers.find(u => u.toLowerCase() === maker.toLowerCase());
        const takerMatch = config.targetUsers.find(u => u.toLowerCase() === taker.toLowerCase());

        if (!makerMatch && !takerMatch) return;

        const user = makerMatch || takerMatch;
        if (!user) return; // Should not happen given logic above
        const txHash = log.transactionHash;
        const uniqueId = `${txHash}-${user.toLowerCase()}`;

        // Deduplicate
        const stmt = db.prepare('SELECT id FROM processed_activities WHERE id = ?');
        if (stmt.get(uniqueId)) return;

        db.prepare('INSERT INTO processed_activities (id, user_address, timestamp) VALUES (?, ?, ?)').run(
            uniqueId,
            user,
            Date.now()
        );

        console.log(`[MONITOR] Trade detected for ${user} in tx ${txHash}`);

        // Determine Trade Direction/Type
        // Maker: Provided makerAssetId, received takerAssetId
        // Taker: Provided takerAssetId, received makerAssetId

        // Asset ID '0' (or very small) is usually Collateral (USDC/Bridged USDC).
        // Conditional Tokens have large IDs.
        // We assume Asset ID 0 = USDC (or equivalent collateral) for simplicity, 
        // BUT we need to be careful. Polygon USDC is 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174. 
        // The CTF Exchange wrapper might handle raw tokens or IDs.
        // Usually in CTF:
        // - Collateral is the "Quote" currency.
        // - Conditional Token is the "Base" currency.

        // Logic:
        // If User gave Collateral (ID 0) -> They SPENT money -> BUY.
        // If User gave Outcome Token (ID != 0) -> They SPENT shares -> SELL.

        // Note: CTF Exchange uses 0 for collateral (USDC). 
        // We compare as strings "0" just to be safe.

        let side: 'BUY' | 'SELL' = 'BUY'; // Default (conservative, but we will overwrite)

        if (user.toLowerCase() === maker.toLowerCase()) {
            // User is Maker
            if (makerAssetId.toString() === '0') {
                side = 'BUY';
            } else {
                side = 'SELL';
            }
        } else {
            // User is Taker
            if (takerAssetId.toString() === '0') {
                side = 'BUY';
            } else {
                side = 'SELL';
            }
        }

        console.log(`[MONITOR] Trade detected for ${user} in tx ${txHash} [${side}]`);

        monitorEvents.emit('trade_detected', {
            user,
            txHash,
            maker,
            taker,
            makerAssetId: makerAssetId.toString(),
            takerAssetId: takerAssetId.toString(),
            makerAmount: makerAmountFilled.toString(),
            takerAmount: takerAmountFilled.toString(),
            side // Emit derived side
        });

    } catch (err) {
        console.error(`Error processing log:`, err);
    }
}

export async function startMonitoring() {
    console.log('Starting On-Chain Monitoring...');

    // Get start block
    try {
        lastCheckedBlock = await PROVIDER.getBlockNumber();
        console.log(`Start Block: ${lastCheckedBlock}`);
    } catch (e) {
        console.error('Failed to get start block:', e);
        return;
    }

    let isPolling = false;

    // Poll Loop
    setInterval(async () => {
        if (isPolling) return;
        isPolling = true;

        try {
            const currentBlock = await PROVIDER.getBlockNumber();
            if (currentBlock <= lastCheckedBlock) {
                isPolling = false;
                return;
            }

            const fromBlock = lastCheckedBlock + 1;
            const toBlock = Math.min(currentBlock, fromBlock + 100); // reduced from 1000 to 100 for public RPC stability

            console.log(`[MONITOR] Checking blocks ${fromBlock}-${toBlock} for targets: ${config.targetUsers.join(', ')}`);

            const addresses = [CTF_EXCHANGE_ADDR_BINARY];
            const logs: ethers.providers.Log[] = [];

            for (const addr of addresses) {
                try {
                    const addrLogs = await PROVIDER.getLogs({
                        address: addr,
                        topics: [ORDER_FILLED_TOPIC],
                        fromBlock,
                        toBlock
                    });
                    logs.push(...addrLogs);
                } catch (e: any) {
                    if (e.message?.includes('Too many requests')) {
                        console.warn(`[MONITOR] Rate limit hit for ${addr}, skipping this address...`);
                    } else {
                        console.error(`[MONITOR] Error getting logs for ${addr}:`, e.message);
                    }
                }
            }

            if (logs.length > 0) {
                // Sort logs by block number and log index to process in order
                const sortedLogs = logs.sort((a, b) => {
                    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
                    return a.logIndex - b.logIndex;
                });

                console.log(`[MONITOR] Found ${sortedLogs.length} fills in blocks ${fromBlock}-${toBlock}`);

                // Indexing delay
                if (sortedLogs.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                for (const log of sortedLogs) {
                    await processLog(log);
                }
            }

            lastCheckedBlock = toBlock;

        } catch (err: any) {
            const msg = err.message || "";
            if (msg.includes('Too many requests') || msg.includes('Exceeded the quota usage') || msg.includes('429')) {
                console.warn('[MONITOR] RPC Rate Limit Hit. Waiting for next interval...');
            } else {
                console.error('[MONITOR] Polling Error:', msg);
            }
        } finally {
            isPolling = false;
        }
    }, config.pollIntervalMs);
}

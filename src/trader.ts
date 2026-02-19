import { ClobClient, Side, AssetType } from '@polymarket/clob-client';
import axios from 'axios';
import { SignatureType } from '@polymarket/order-utils';
import { ethers } from 'ethers';
import { config } from './config';
import { monitorEvents } from './monitor';
import db from './db';
import { getMarketFromUserPosition, cacheMarket } from './utils';
import { sendTradeNotification, sendErrorNotification, sendClosedTradeNotification } from './telegram';
import { Balances, TradeNotificationData, Position } from './types';

// Locks and State
let isClaiming = false;
let isTraderReady = false;
let isPaused = false;
let lastTradeTime = 0;
let clobClient: ClobClient;
const MIN_TRADE_INTERVAL_MS = 5000;
const lastTradePerMarketOutcome: Record<string, number> = {};
const TRADE_COOLDOWN_MS = 60000;

export async function closeSpecificPosition(position: Position) {
    if (!clobClient || !signer) return;

    try {
        const marketID = position.market_id;

        // Fetch market to get tokens
        const market = await clobClient.getMarket(marketID);
        if (!market) {
            console.error(`[CLOSING] Market not found for ${marketID}`);
            return;
        }

        const token0 = market.tokens?.[0] as any;
        const token1 = market.tokens?.[1] as any;

        if (!token0 || !token1) {
            console.error(`[CLOSING] Tokens not found in market data for ${marketID}`, JSON.stringify(market));
            return;
        }

        const t0Id = token0.tokenId || token0.token_id;
        const t1Id = token1.tokenId || token1.token_id;

        if (!t0Id || !t1Id) {
            console.error(`[CLOSING] Could not find token ID in objects.`);
            return;
        }

        const funder = config.proxyAddress || signer.address;
        const ctf = new ethers.Contract(CONDITIONAL_TOKENS_ADDR, CONDITIONAL_TOKENS_ABI, signer);
        const balance0 = await ctf.balanceOf(funder, t0Id);
        const balance1 = await ctf.balanceOf(funder, t1Id);

        console.log(`[CLOSING] B0 (${funder}): ${balance0?.toString()}, B1: ${balance1?.toString()}`);

        const updates = [];
        let exitPrice = 0;

        // Determine which token to sell based on outcome
        const sellTokenId = position.outcome === 'Yes' ? t0Id : t1Id;
        const sellBalance = position.outcome === 'Yes' ? balance0 : balance1;

        if (sellBalance && sellBalance.gt(0)) {
            // Fetch orderbook to estimate exit price
            try {
                const book = await clobClient.getOrderBook(sellTokenId);
                if (book.bids && book.bids.length > 0) {
                    exitPrice = parseFloat(book.bids[0].price);
                } else {
                    exitPrice = 0.01; // Worst case fallback
                }
            } catch (e) {
                exitPrice = 0.01;
            }

            console.log(`[CLOSING] Selling ${position.outcome} (Balance: ${sellBalance.toString()}) at estimated price ${exitPrice}...`);
            await clobClient.createAndPostOrder({
                tokenID: sellTokenId,
                price: 0.001, // Market Sell (Dump)
                side: Side.SELL,
                size: parseFloat(ethers.utils.formatUnits(sellBalance, 6)),
                feeRateBps: 0,
            });
            updates.push(position.outcome);
        }

        if (updates.length > 0 || sellBalance.isZero()) {
            const pnl = (exitPrice - position.entry_price) * position.amount;
            const pnlPercentage = position.entry_price > 0 ? ((exitPrice - position.entry_price) / position.entry_price) * 100 : 0;
            const status = pnl > 0 ? 'WON' : (pnl < 0 ? 'LOST' : 'CLOSED');

            db.prepare('UPDATE positions SET status = ?, exit_price = ?, pnl = ? WHERE id = ?').run('CLOSED', exitPrice, pnl, position.id);
            console.log(`[CLOSING] Successfully closed position ${position.id}. Exit: ${exitPrice}, PnL: ${pnl.toFixed(2)}`);

            await sendClosedTradeNotification({
                targetUser: position.target_user || 'Unknown',
                targetName: position.target_user ? (TARGET_NAMES[position.target_user.toLowerCase()] || position.target_user) : 'Bot',
                marketSlug: position.slug || position.market_id,
                marketId: position.market_id,
                outcome: position.outcome,
                amountUsd: position.amount,
                entryPrice: position.entry_price,
                exitPrice: exitPrice,
                pnl: pnl,
                pnlPercentage: pnlPercentage,
                status: status
            });
        }

    } catch (e: any) {
        console.error('[TRADER] Error closing position:', e.message);
    }
}


const provider = new ethers.providers.StaticJsonRpcProvider(config.rpcUrl, { name: 'polygon', chainId: 137 });
const signer = new ethers.Wallet(config.privateKey || ethers.Wallet.createRandom().privateKey, provider);

export function setPauseState(paused: boolean) {
    isPaused = paused;
    console.log(`[TRADER] Bot is now ${isPaused ? 'PAUSED 🛑' : 'ACTIVE ▶️'}`);
    return isPaused;
}

export function getPauseState() {
    return isPaused;
}

// Name mapping for targets
export const TARGET_NAMES: Record<string, string> = {
    '0x818f214c7f3e479cce1d964d53fe3db7297558cb': 'livebreathevolatility',
    '0x1979ae6b7e6534de9c4539d0c205e582ca637c9d': '0x1979'
};

// Error suppression/throttling
let lastBalanceErrorTime = 0;
const BALANCE_ERROR_THROTTLE_MS = 3600000; // 1 hour

const FACTORIES = [
    '0xaebc4787d1bd97acc3353599908de16335198e3b', // CtfProxyFactory (Old/Standard)
    '0xaacfeea03eb1561c4e67d661e40682bd20e3541b', // Gnosis Safe Factory
];
const F_ABI = ["function proxyFor(address) view returns (address)"];

export async function init() {
    if (!config.privateKey) {
        console.warn('⚠️ No Private Key provided. Bot running in WATCH-ONLY mode.');
        return;
    }

    console.log('Initializing Trader...', signer.address);
    // Log the address so the user can verify it matches their screenshot
    console.log('Bot Wallet Address:', signer.address);
    try {
        let creds;

        if (config.polymktApiKey && config.polymktSecret && config.polymktPassphrase) {
            console.log("✅ Using provided Polymarket API Credentials.");
            creds = {
                key: config.polymktApiKey,
                secret: config.polymktSecret,
                passphrase: config.polymktPassphrase
            };
        } else {
            console.log("[TRADER] Deriving API Creds from Private Key...");
            try {
                const tempClient = new ClobClient(
                    config.clobApiUrl,
                    137,
                    signer
                );
                creds = await tempClient.deriveApiKey();
                console.log("✅ API Creds derived successfully.");
            } catch (e: any) {
                console.error("❌ Failed to derive credentials:", e.message);
                throw e;
            }
        }

        // Detect Proxy Address (funderAddress)
        let funderAddress: string | undefined = undefined;
        let signatureType: SignatureType = SignatureType.EOA;

        if (config.proxyAddress) {
            funderAddress = config.proxyAddress;
            // Most modern Polymarket proxies identified by users are Gnosis Safes
            signatureType = SignatureType.POLY_GNOSIS_SAFE;
            console.log(`✅ Using explicit Proxy Address: ${funderAddress} (Type: GNOSIS_SAFE)`);
        } else {
            for (const factoryAddr of FACTORIES) {
                try {
                    const factory = new ethers.Contract(factoryAddr, F_ABI, provider);
                    const proxy = await factory.proxyFor(signer.address);
                    if (proxy && proxy !== ethers.constants.AddressZero) {
                        funderAddress = proxy;
                        signatureType = factoryAddr.toLowerCase() === '0xaacfeea03eb1561c4e67d661e40682bd20e3541b'.toLowerCase()
                            ? SignatureType.POLY_GNOSIS_SAFE
                            : SignatureType.POLY_PROXY;

                        console.log(`✅ Proxy Address detected: ${funderAddress} (Type: ${signatureType === SignatureType.POLY_PROXY ? 'POLY_PROXY' : 'GNOSIS_SAFE'})`);
                        break;
                    }
                } catch (e) {
                    // Ignore errors and try next factory
                }
            }
        }

        if (!funderAddress) {
            console.warn('⚠️ No Proxy Wallet detected. Trading as EOA (Make sure you have funds in your main wallet).');
        }

        // Re-initialize with full credentials and funderAddress
        clobClient = new ClobClient(config.clobApiUrl, 137, signer, creds, signatureType, funderAddress);
        console.log("✅ ClobClient initialized with L2 credentials.");
        console.log("   Signer Address: ", signer.address);
        console.log("   Funder (Maker): ", funderAddress || signer.address);

        // Force an allowance check/update at startup
        console.log('[TRADER] Performing startup balance/allowance check...');
        await getBalances();

        // Explicit sync of User and Target positions to avoid scaling into old bets
        const allTargets = config.targetUsers;
        await syncExistingPositions(funderAddress || signer.address, allTargets);

    } catch (err: any) {
        console.error('❌ Failed to init CLOB Client:', err.message);
    }
}

async function syncExistingPositions(userAddress: string, targets: string[]) {
    console.log(`[SYNC] Synchronizing portfolios for: User(${userAddress}) and ${targets.length} targets...`);

    // 0. DEDUPLICATE: Clean up massive duplication from previous runs
    try {
        const dupes = db.prepare(`
            SELECT market_id, outcome, COUNT(*) as count 
            FROM positions 
            WHERE status = 'OPEN' 
            GROUP BY market_id, outcome 
            HAVING count > 1
        `).all() as any[];

        let removedTotal = 0;
        for (const d of dupes) {
            // Keep the one with the highest ID (most recent) and mark others as CLOSED
            const allOfThem = db.prepare('SELECT id FROM positions WHERE market_id = ? AND outcome = ? AND status = ? ORDER BY id DESC').all(d.market_id, d.outcome, 'OPEN') as any[];
            const toClose = allOfThem.slice(1); // All except the first one
            for (const item of toClose) {
                db.prepare('UPDATE positions SET status = ? WHERE id = ?').run('CLOSED', item.id);
                removedTotal++;
            }
        }
        if (removedTotal > 0) console.log(`[SYNC] Deduplicated ${removedTotal} redundant position entries.`);
    } catch (e: any) {
        console.warn(`[SYNC] Deduplication failed: ${e.message}`);
    }

    // 1. Sync User Positions (To seed and RECONCILE the local positions table)
    if (ethers.utils.isAddress(userAddress)) {
        try {
            const userRes = await axios.get(`https://data-api.polymarket.com/positions?user=${userAddress}`);
            if (userRes.data && Array.isArray(userRes.data)) {
                const livePositions = userRes.data;
                const liveAssetIds = new Set(livePositions.map((p: any) => p.asset));

                // A. RECONCILE: Mark local positions as CLOSED if they aren't on-chain anymore
                const localOpen = db.prepare('SELECT id, asset_id, market_id, outcome FROM positions WHERE status = ?').all('OPEN') as any[];
                let closedCount = 0;
                for (const p of localOpen) {
                    let isStale = false;
                    if (p.asset_id) {
                        // Method 1: ID Match (Precise)
                        isStale = !liveAssetIds.has(p.asset_id);
                    } else {
                        // Method 2: Market + Outcome Match (Fallback for legacy entries)
                        const match = livePositions.find((lp: any) => lp.conditionId === p.market_id && lp.outcome === p.outcome);
                        isStale = !match;
                    }

                    if (isStale) {
                        db.prepare('UPDATE positions SET status = ? WHERE id = ?').run('CLOSED', p.id);
                        closedCount++;
                    }
                }
                if (closedCount > 0) console.log(`[SYNC] Cleared ${closedCount} stale positions from local DB (marked as CLOSED).`);

                // B. SEED: Insert or Ignore new positions
                let newCount = 0;
                userRes.data.forEach((p: any) => {
                    const info = db.prepare('INSERT OR IGNORE INTO positions (market_id, outcome, amount, status, entry_price, timestamp, target_user, asset_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
                        p.conditionId,
                        p.outcome,
                        parseFloat(p.initialValue),
                        'OPEN',
                        p.avgPrice,
                        Date.now(),
                        'Sync (Pre-existing)',
                        p.asset
                    );
                    if (info.changes > 0) newCount++;
                });
                if (newCount > 0) console.log(`[SYNC] Seeded ${newCount} new user positions into DB.`);
            }
        } catch (e: any) {
            console.warn(`[SYNC] Could not fetch positions for user ${userAddress}: ${e.message}`);
        }
    }

    // 2. Sync Target Positions (To mark markets as ineligible)
    // 2. Sync Target Positions (To populate Market Cache)
    for (const target of targets) {
        if (!ethers.utils.isAddress(target)) {
            console.log(`[SYNC] Skipping non-address target: ${target}`);
            continue;
        }

        try {
            const baseUrl = 'https://data-api.polymarket.com/positions';
            const targetRes = await axios.get(`${baseUrl}?user=${target}`);

            if (targetRes.data && Array.isArray(targetRes.data)) {
                let count = 0;
                targetRes.data.forEach((p: any) => {
                    // Populate Cache
                    if (p.asset && p.conditionId) {
                        const marketData = {
                            marketId: p.conditionId,
                            outcome: p.outcome,
                            slug: p.slug,
                            assetId: p.asset
                        };
                        cacheMarket(p.asset, marketData);
                    }
                });
                // if (count > 0) console.log(`[SYNC] Marked ${count} new markets as ineligible from target ${target}.`);
            }
        } catch (e: any) {
            console.warn(`[SYNC] Could not fetch positions for target ${target}: ${e.message}`);
        }
    }
    console.log('[SYNC] Portfolio synchronization complete.');
}

import { CONDITIONAL_TOKENS_ABI, CONDITIONAL_TOKENS_ADDR, USDC_E_ADDR, CTF_EXCHANGE_ADDR_BINARY, CTF_EXCHANGE_ABI, GNOSIS_SAFE_ABI, CTF_PROXY_ABI } from './abi';

async function getDynamicGasFees() {
    try {
        const feeData = await provider.getFeeData();

        // Polygon 100% requires higher priority fees during congestion.
        // We set a hard floor of 50 Gwei for priority fee.
        const minPriorityFee = ethers.utils.parseUnits('50', 'gwei');
        let maxPriorityFee = feeData.maxPriorityFeePerGas || minPriorityFee;

        if (maxPriorityFee.lt(minPriorityFee)) {
            maxPriorityFee = minPriorityFee;
        } else {
            // If it's already high, add 20% buffer
            maxPriorityFee = maxPriorityFee.mul(120).div(100);
        }

        // Max Fee should be base fee + priority fee. 
        // We'll use feeData.maxFeePerGas if it looks reasonable, or calculate from baseFee.
        const baseFee = feeData.lastBaseFeePerGas || ethers.utils.parseUnits('100', 'gwei');
        let maxFee = baseFee.add(maxPriorityFee).mul(135).div(100); // 35% margin on top of base+tip

        // Cap maxFee at 1500 Gwei to handle extreme congestion (common in Polygon)
        const capWeight = ethers.utils.parseUnits('1500', 'gwei');
        if (maxFee.gt(capWeight)) {
            maxFee = capWeight;
        }

        console.log(`[GAS] Tip: ${ethers.utils.formatUnits(maxPriorityFee, 'gwei')} Gwei | Max: ${ethers.utils.formatUnits(maxFee, 'gwei')} Gwei`);

        return { maxPriorityFee, maxFee };
    } catch (e) {
        console.warn('[GAS] Failed to fetch live fee data, using defaults:', e);
        return {
            maxPriorityFee: ethers.utils.parseUnits('35', 'gwei'),
            maxFee: ethers.utils.parseUnits('200', 'gwei')
        };
    }
}

async function redeemViaProxy(proxyAddr: string, conditionId: string, outcomeIndex: number) {
    const proxy = new ethers.Contract(proxyAddr, GNOSIS_SAFE_ABI, signer);

    try {
        const indexSet = [1 << outcomeIndex];
        const ctfInterface = new ethers.utils.Interface(CONDITIONAL_TOKENS_ABI);
        const data = ctfInterface.encodeFunctionData("redeemPositions", [
            USDC_E_ADDR,
            ethers.constants.HashZero,
            conditionId,
            indexSet
        ]);

        console.log(`[TRADER] Attempting Gnosis Safe redemption for ${conditionId}...`);

        // v=1 signature format for owner execution in threshold 1 Safes
        const signature = `0x000000000000000000000000${signer.address.slice(2)}000000000000000000000000000000000000000000000000000000000000000001`;

        const { maxPriorityFee, maxFee } = await getDynamicGasFees();

        const tx = await proxy.execTransaction(
            CONDITIONAL_TOKENS_ADDR,
            0,
            data,
            0, // Operation.Call
            0,
            0,
            0,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            signature,
            {
                gasLimit: 400000,
                maxPriorityFeePerGas: maxPriorityFee,
                maxFeePerGas: maxFee
            }
        );

        console.log(`[TRADER] Proxy Redemption Tx sent: ${tx.hash}. Waiting for confirmation (60s timeout)...`);

        // Use a timeout to avoid hanging forever if the RPC fails to notify
        const receipt = await Promise.race([
            tx.wait(1),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 60000))
        ]) as ethers.providers.TransactionReceipt;

        console.log(`✅ Proxy Redemption Confirmed in block ${receipt.blockNumber}`);
        return true;
    } catch (e: any) {
        if (e.message === 'TIMEOUT') {
            console.warn(`[TRADER] ⏳ Wait timed out for tx. It may still confirm later. skipping to next...`);
            return false;
        }
        console.log(`[TRADER] Safe execTransaction skipped or failed: ${e.message}`);

        // --- CRITICAL: If balance is low, DO NOT try fallback, just stop ---
        if (e.message.toLowerCase().includes('insufficient funds') ||
            e.message.includes('rate limit') ||
            e.message.includes('429') ||
            e.message.includes('exceeds the configured cap')) {
            throw e;
        }

        console.log(`[TRADER] Trying CtfProxy fallback for ${conditionId}...`);
        const ctfProxy = new ethers.Contract(proxyAddr, CTF_PROXY_ABI, signer);
        const indexSet = [1 << outcomeIndex];

        const { maxPriorityFee, maxFee } = await getDynamicGasFees();

        const tx = await ctfProxy.redeem(
            USDC_E_ADDR,
            ethers.constants.HashZero,
            conditionId,
            indexSet,
            {
                gasLimit: 300000,
                maxPriorityFeePerGas: maxPriorityFee,
                maxFeePerGas: maxFee
            }
        );
        console.log(`[TRADER] CtfProxy Redemption Tx sent: ${tx.hash}. Waiting for confirmation...`);
        const receipt = await tx.wait(1);
        console.log(`✅ CtfProxy Redemption Confirmed in block ${receipt.blockNumber}`);
        return true;
    }
}

export async function claimPositions() {
    if (isClaiming) {
        console.log('[TRADER] ⏳ Claim process already in progress. Skipping...');
        return 'Alredy claiming...';
    }
    isClaiming = true;
    console.log('[TRADER] Checking for redeemable positions on all accounts...');
    try {
        const addressesToCheck = [];
        if (config.proxyAddress && ethers.utils.isAddress(config.proxyAddress)) {
            addressesToCheck.push({ address: config.proxyAddress, isProxy: true });
        }
        if (signer.address && ethers.utils.isAddress(signer.address)) {
            // Avoid duplicates if Proxy matches Signer (unlikely but safe)
            if (signer.address.toLowerCase() !== config.proxyAddress?.toLowerCase()) {
                addressesToCheck.push({ address: signer.address, isProxy: false });
            }
        }

        let totalRedeemableCount = 0;
        let successCount = 0;
        let lastError = "";
        const allRedeemable: { pos: any, isProxy: boolean, account: string }[] = [];

        const pendingNonce = await provider.getTransactionCount(signer.address, 'pending');
        const confirmedNonce = await provider.getTransactionCount(signer.address);
        const backlog = pendingNonce - confirmedNonce;

        if (backlog > 5) {
            console.warn(`[TRADER] ⚠️ Backlog too high (${backlog} pending). Attempting automatic rescue...`);

            try {
                const gasData = await provider.getFeeData();
                const maxPriorityFee = ethers.utils.parseUnits('150', 'gwei');
                const maxFee = ethers.utils.parseUnits('600', 'gwei');

                console.log(`[TRADER] Sending "Push" rescue tx to unblock nonce ${confirmedNonce}...`);
                const rescueTx = await signer.sendTransaction({
                    to: signer.address,
                    value: 0,
                    nonce: confirmedNonce,
                    maxPriorityFeePerGas: maxPriorityFee,
                    maxFeePerGas: maxFee,
                    gasLimit: 300000 // A bit extra for safety
                });

                console.log(`[TRADER] 🚀 Automatic Rescue Tx sent: ${rescueTx.hash}. Waiting...`);
                await rescueTx.wait(1);
                console.log(`[TRADER] ✅ Rescue successful. Queue should start moving.`);
                return `🚀 Se ha enviado un rescate automático para desbloquear la cola (29 transacciones). Reintenta en un momento.`;
            } catch (rescueErr: any) {
                console.error(`[TRADER] ❌ Automatic rescue failed: ${rescueErr.message}`);
                return `⏳ Red congestionada (${backlog} pendientes). El rescate falló.`;
            }
        }

        for (const account of addressesToCheck) {
            try {
                const posRes = await axios.get(`https://data-api.polymarket.com/positions?user=${account.address}`);

                if (!posRes.data || !Array.isArray(posRes.data)) {
                    continue;
                }

                const redeemable = posRes.data.filter((p: any) => p.redeemable === true);
                redeemable.forEach((p: any) => {
                    allRedeemable.push({ pos: p, isProxy: account.isProxy, account: account.address });
                });
            } catch (e: any) {
                console.warn(`[TRADER] Could not fetch positions for ${account.address}: ${e.message}`);
            }
        }

        totalRedeemableCount = allRedeemable.length;

        if (totalRedeemableCount === 0) {
            console.log('[TRADER] No redeemable positions found on EOA or Proxy.');
            return "No winning positions to claim.";
        }

        console.log(`[TRADER] Found ${totalRedeemableCount} total redeemable positions across all accounts.`);

        for (const item of allRedeemable) {
            const { pos, isProxy, account } = item;
            try {
                console.log(`[TRADER] Claiming for ${account} | ${pos.title || pos.conditionId}`);

                console.log(`[TRADER] Claiming Position details: Value=$${pos.initialValue}, AvgPrice=${pos.avgPrice}`);

                let success = false;
                if (isProxy) {
                    success = await redeemViaProxy(account, pos.conditionId, pos.outcomeIndex);
                } else {
                    const indexSet = [1 << pos.outcomeIndex];
                    const ctf = new ethers.Contract(CONDITIONAL_TOKENS_ADDR, CONDITIONAL_TOKENS_ABI, signer);

                    const { maxPriorityFee, maxFee } = await getDynamicGasFees();

                    const tx = await ctf.redeemPositions(
                        USDC_E_ADDR,
                        ethers.constants.HashZero,
                        pos.conditionId,
                        indexSet,
                        {
                            gasLimit: 300000,
                            maxPriorityFeePerGas: maxPriorityFee,
                            maxFeePerGas: maxFee
                        }
                    );
                    console.log(`[TRADER] EOA Redemption Tx sent: ${tx.hash}. Waiting for confirmation (60s timeout)...`);

                    const receipt = await Promise.race([
                        tx.wait(1),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 60000))
                    ]) as ethers.providers.TransactionReceipt;

                    if (receipt) {
                        console.log(`✅ EOA Redemption Confirmed in block ${receipt.blockNumber}`);
                        success = true;
                    } else {
                        console.warn(`[TRADER] ⏳ Wait timed out or returned null for EOA tx.`);
                    }
                }

                if (!success) {
                    console.warn(`[TRADER] Claim process for ${pos.conditionId} did not confirm yet. Skipping DB update.`);
                    continue;
                }

                // Correct PnL Calculation for a WIN:
                const entryPrice = parseFloat(pos.avgPrice) || 0;
                const initialValue = parseFloat(pos.initialValue) || 0;

                let pnl = 0;
                let pnlPercentage = 0;

                if (entryPrice > 0) {
                    const shares = initialValue / entryPrice;
                    pnl = (1.0 - entryPrice) * shares;
                    pnlPercentage = ((1.0 - entryPrice) / entryPrice) * 100;
                }

                console.log(`[TRADER] Win detected! Entry: ${entryPrice}, PnL: $${pnl.toFixed(2)}`);

                db.prepare('UPDATE positions SET status = ?, exit_price = ?, pnl = ? WHERE market_id = ? AND outcome = ? AND status = ?').run(
                    'CLOSED',
                    1.0,
                    pnl,
                    pos.conditionId,
                    pos.outcome,
                    'OPEN'
                );

                await sendClosedTradeNotification({
                    targetUser: 'Winning Claim',
                    targetName: 'Bot',
                    marketSlug: pos.slug || pos.conditionId,
                    marketId: pos.conditionId,
                    outcome: pos.outcome,
                    amountUsd: initialValue,
                    entryPrice: entryPrice,
                    exitPrice: 1.0,
                    pnl: pnl,
                    pnlPercentage: pnlPercentage,
                    status: 'WON'
                });

                successCount++;

                console.log('[TRADER] Waiting 5s before next claim to respect RPC limits...');
                await new Promise(r => setTimeout(r, 5000));
            } catch (err: any) {
                console.error(`[TRADER] ❌ Failed to claim ${pos.conditionId} for ${account}:`, err.message);
                lastError = err.message;
                if (err.message.includes('429') || err.message.includes('rate limit')) {
                    console.warn('[TRADER] RPC Rate limit hit. Skipping further claims this round.');
                    break;
                }
            }
        }

        if (successCount === 0 && totalRedeemableCount > 0) {
            return `❌ Error: No se pudo cobrar ninguna de las ${totalRedeemableCount} posiciones. Detalles: ${lastError}`;
        }

        return `✅ Reclamadas ${successCount} de ${totalRedeemableCount} posiciones ganadoras.`;

    } catch (e: any) {
        console.error('[TRADER] Error in claimPositions:', e.message);
        return `❌ Error general al reclamar: ${e.message}`;
    } finally {
        isClaiming = false;
    }
}

export async function closeAllPositions() {
    console.log('[TRADER] Closing all open positions...');
    const positions = db.prepare('SELECT * FROM positions WHERE status = ?').all('OPEN') as Position[];

    if (positions.length === 0) {
        return "No open positions to close.";
    }

    let closedCount = 0;
    let errorCount = 0;

    for (const pos of positions) {
        console.log(`[TRADER] Closing position: ${pos.market_id} (${pos.outcome})`);
        try {
            await closeSpecificPosition(pos);
            closedCount++;
        } catch (e: any) {
            console.error(`[TRADER] Failed to close ${pos.market_id}: ${e.message}`);
            errorCount++;
        }
        // Delay to avoid RPC rate limits (Free tier is generous but bursty)
        await new Promise(r => setTimeout(r, 2000));
    }

    return `✅ Intentado cerrar ${positions.length} posiciones.\n(Revisa los logs para confirmar ejecución).`;
}

export async function getBalances(): Promise<Balances> {
    try {
        const matic = await signer.getBalance();
        const maticEth = ethers.utils.formatEther(matic);

        let cash = '0';
        let portfolio = '0';

        if (clobClient) {
            try {
                // 1. Get Cash balance (USDC) from SDK
                const resp: any = await clobClient.getBalanceAllowance({
                    asset_type: AssetType.COLLATERAL
                });

                const cashRaw = resp.balance || '0';
                const cashNum = parseFloat(ethers.utils.formatUnits(cashRaw, 6));
                cash = cashNum.toFixed(2);

                // 2. Get Portfolio value (Cash + Positions) from Data API
                // We sum the 'currentValue' of all open positions
                let positionValue = 0;
                const funder = clobClient.orderBuilder.funderAddress || signer.address;
                try {
                    const posRes = await axios.get(`https://data-api.polymarket.com/positions?user=${funder}`);
                    if (posRes.data && Array.isArray(posRes.data)) {
                        posRes.data.forEach((p: any) => {
                            positionValue += parseFloat(p.currentValue || '0');
                        });
                    }
                } catch (e) {
                    // Fallback to cash only if API fails
                }
                portfolio = (cashNum + positionValue).toFixed(2);

                const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
                const allowanceRaw = resp.allowances?.[CTF_EXCHANGE] || '0';
                const allowanceNum = parseFloat(ethers.utils.formatUnits(allowanceRaw, 6));

                console.log(`[BALANCES] Wallet: ${signer.address} | Matic: ${maticEth} | Cash: $${cash} | Portfolio: $${portfolio} | Allowance: ${allowanceNum}`);

                // Perform manual on-chain approval if necessary
                if (allowanceNum < 1.0) {
                    console.log('⚠️ Allowance is low. Attempting manual on-chain approval...');
                    const USDC_E = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';

                    const erc20 = new ethers.Contract(
                        USDC_E,
                        ["function approve(address spender, uint256 amount) returns (bool)"],
                        signer
                    );

                    console.log(`[ON-CHAIN] Approving ${CTF_EXCHANGE} for ${USDC_E}...`);
                    const tx = await erc20.approve(CTF_EXCHANGE, ethers.constants.MaxUint256, {
                        gasLimit: 100000,
                        maxPriorityFeePerGas: ethers.utils.parseUnits('35', 'gwei'),
                        maxFeePerGas: ethers.utils.parseUnits('60', 'gwei')
                    });
                    console.log(`[ON-CHAIN] Tx sent: ${tx.hash}. Waiting for confirmation...`);
                    await tx.wait();
                    console.log('✅ Allowance updated successfully on-chain.');

                    // Sync with CLOB API after on-chain approval
                    console.log('Syncing allowance with Polymarket API...');
                    await clobClient.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
                    console.log('✅ Allowance sync request sent.');
                }

                if (cashNum < 0.5) {
                    console.warn(`❌ [TRADER] Insufficient Balance: ${cashNum} USDC.e. Bot will wait for funds.`);
                } else {
                    isTraderReady = true;
                    console.log('🚀 TRADER IS READY AND FULLY CONFIGURED.');
                }
            } catch (e: any) {
                console.error('[BALANCES] Failed to get portfolio balance:', e.message);
                sendErrorNotification(e);
            }
        }

        return {
            matic: maticEth,
            cash: cash,
            portfolio: portfolio
        };
    } catch (e: any) {
        console.error('[BALANCES] Error getting balances:', e.message);
        return { matic: '0', cash: '0', portfolio: '0' };
    }
}

monitorEvents.on('trade_detected', async (event: any) => {
    if (isPaused) {
        console.log(`[TRADER] ⏸️ Paused. Skipping trade from ${event.txHash}`);
        return;
    }

    if (!isTraderReady) {
        console.log(`[TRADER] Not ready yet. Skipping trade detection from ${event.txHash}`);
        return;
    }

    const now = Date.now();
    // if (now - lastTradeTime < MIN_TRADE_INTERVAL_MS) {
    //     console.log(`[TRADER] Cooldown active. Skipping trade from ${event.txHash} (Target is trading too fast)`);
    //     return;
    // }

    lastTradeTime = now;

    // Wait for indexing (Data API can be slow)
    await new Promise(r => setTimeout(r, 10000));

    try {
        // 1. Resolve Asset -> Market
        // Ignore Asset ID '0' (Collateral/USDC) for resolution
        const makerId = event.makerAssetId === '0' ? null : event.makerAssetId;
        const takerId = event.takerAssetId === '0' ? null : event.takerAssetId;

        const assetToResolve = makerId || takerId;

        if (!assetToResolve) {
            console.log(`[TRADER] Skipping resolution for pure collateral move in ${event.txHash}`);
            return;
        }

        const position = await getMarketFromUserPosition(event.user, assetToResolve);

        if (!position) {
            console.log(`[TRADER] Could not resolve market for asset ${assetToResolve} in ${event.txHash}`);
            return;
        }

        console.log(`[TRADER] Resolved: Market=${position.slug}, Outcome=${position.outcome} (${position.assetId})`);

        // 2. Filter Duplicates (MODIFIED: Allow Add-ons)
        // We used to return here if 'existing' was found. 
        // Now we just fetch it to decide whether to INSERT or UPDATE later.
        // Check Max Exposure (Sum all open positions for this market)
        const allRelevant = db.prepare('SELECT amount FROM positions WHERE market_id = ? AND status = ?').all(position.marketId, 'OPEN') as { amount: number }[];
        const totalExposure = allRelevant.reduce((sum, p) => sum + p.amount, 0);

        if (totalExposure >= config.maxExposureUsd) {
            console.log(`[TRADER] Max exposure reached for ${position.slug} ($${totalExposure.toFixed(2)} / $${config.maxExposureUsd}). Skipping.`);
            return;
        }

        const existing = db.prepare('SELECT * FROM positions WHERE market_id = ? AND status = ?').get(position.marketId, 'OPEN') as Position | undefined;

        if (existing) {
            console.log(`[TRADER] Existing position found for ${position.slug}. Current Amount: $${existing.amount}`);

            // Check Cooldown
            const cooldownKey = `${position.marketId}-${position.outcome}`;
            const lastTradeUtc = lastTradePerMarketOutcome[cooldownKey] || 0;
            const now = Date.now();
            if (now - lastTradeUtc < TRADE_COOLDOWN_MS) {
                console.log(`[TRADER] ⏳ COOLDOWN: Skipping ${position.slug} (${position.outcome}) - Last trade was ${(now - lastTradeUtc) / 1000}s ago`);
                return;
            }
        }

        /*
        const ineligible = db.prepare('SELECT reason FROM ineligible_markets WHERE condition_id = ?').get(position.marketId) as { reason: string } | undefined;
        if (ineligible) {
            console.log(`[TRADER] Skipping ${position.slug}: Market is ineligible (${ineligible.reason})`);
            return;
        }
        */

        // 3. Calculate $1 Amount
        // ... (Buy logic remains same) ...

        // ... (After Order Success) ...


        // --- HANDLE SELL (EXIT) ---
        if (event.side === 'SELL') {
            console.log(`[TRADER] Target is SELLING ${position.slug}. Checking if we have a position...`);
            const openPosition = db.prepare('SELECT * FROM positions WHERE market_id = ? AND status = ?').get(position.marketId, 'OPEN') as Position | undefined;

            if (openPosition) {
                console.log(`[TRADER] 🚨 MATCHING EXIT: Closing position in ${position.slug} to match target.`);
                await closeSpecificPosition(openPosition); // We need to implement this helper or allow closeAll to take an arg
            } else {
                console.log(`[TRADER] Target sold ${position.slug}, but we don't have an open position. Ignoring.`);
            }
            return;
        }

        // --- HANDLE BUY (ENTRY) ---
        if (!clobClient) {
            console.log(`[DRY-RUN] Would buy $1 of ${position.slug} (${position.outcome})`);
            const notificationData: TradeNotificationData = {
                targetUser: event.user,
                targetName: TARGET_NAMES[event.user.toLowerCase()],
                marketSlug: position.slug,
                marketId: position.marketId,
                side: 'BUY',
                outcome: position.outcome,
                amountUsd: config.maxPositionSizeUsd,
                price: 'N/A (Dry Run)',
                txHash: 'DRY-RUN',
                newBalance: 'N/A'
            };
            sendTradeNotification(notificationData);
            return;
        }

        const book = await clobClient.getOrderBook(position.assetId);
        if (!book.asks || book.asks.length === 0) {
            console.log('[TRADER] No asks available for this asset.');
            return;
        }

        const bestAskStr = book.asks[0].price;
        const bestAsk = parseFloat(bestAskStr);
        if (bestAsk <= 0 || bestAsk >= 1) {
            console.log('[TRADER] Invalid best ask:', bestAsk);
            return;
        }

        // Ensure we hit the $1 minimum by using ceil, AND the CLOB minimum size (usually 5 shares)
        const rawSize = config.maxPositionSizeUsd / bestAsk;
        const MIN_SHARES = 5;
        const size = Math.max(MIN_SHARES, Math.ceil(rawSize));

        if (size * bestAsk > config.maxPositionSizeUsd * 2) {
            console.warn(`[TRADER] ⚠️ Min size (${size}) forces trade value ($${(size * bestAsk).toFixed(2)}) to exceed limit ($${config.maxPositionSizeUsd})`);
        }

        console.log(`[TRADER] Fetching fee rate for ${position.assetId}...`);
        let feeRateBps = 0;
        try {
            feeRateBps = await clobClient.getFeeRateBps(position.assetId);
            console.log(`[TRADER] Market Fee Rate: ${feeRateBps} BPS`);
        } catch (e: any) {
            console.warn('[TRADER] Could not fetch fee rate, using 0:', e.message);
        }

        // Add 1% slippage to price to ensure immediate fill (up to 0.99 limit)
        const limitPrice = Math.min(0.99, Math.round((bestAsk * 1.01) * 1000) / 1000);

        console.log(`[TRADER] placing Buy for $${config.maxPositionSizeUsd} @ ${limitPrice} (Size: ${size}, Fee: ${feeRateBps})`);

        // Debug: Log the funder address being used by the builder
        console.log(`[TRADER] Order Builder Funder: ${clobClient.orderBuilder.funderAddress}`);

        // Use createAndPostOrder to actually execute the trade
        const orderArgs = {
            tokenID: position.assetId,
            price: limitPrice,
            side: Side.BUY,
            size: size,
            feeRateBps: feeRateBps
        };

        let response;
        try {
            response = await clobClient.createAndPostOrder(orderArgs);
            console.log('✅ [TRADER] Order Placement result:', JSON.stringify(response));
        } catch (err: any) {
            console.error('❌ [TRADER] Failed to place order on CLOB:', err.message);
            if (err.response?.data) {
                console.error('[TRADER] CLOB Error Details:', JSON.stringify(err.response.data));
            }
            return;
        }

        const res = response as any;
        const isSuccess = res.status === 'OK' || res.status === 200 || res.status === 'success' || res.status === 'matched' || res.success === true;

        if (!isSuccess) {
            console.error('[TRADER] Order API returned failure:', JSON.stringify(response));
            return;
        }

        // --- SUCCESS HANDLING ---
        console.log(`[TRADER] Buy Order Success: ${res.orderID}`);

        // NOTIFICATION
        const notificationData: TradeNotificationData = {
            targetUser: event.user,
            targetName: TARGET_NAMES[event.user.toLowerCase()] || 'Target',
            marketSlug: position.slug,
            marketId: position.marketId,
            side: 'BUY',
            outcome: position.outcome,
            amountUsd: config.maxPositionSizeUsd,
            price: limitPrice,
            txHash: res.transactionsHashes?.[0] || res.orderID,
            newBalance: '...' // We fetch balances later
        };
        sendTradeNotification(notificationData);

        // DATABASE UPDATE
        const cooldownKey = `${position.marketId}-${position.outcome}`;
        lastTradePerMarketOutcome[cooldownKey] = Date.now();

        if (existing) {
            console.log(`[TRADER] Updating existing position ${existing.id}...`);
            // Update amount, timestamp, and asset_id.
            db.prepare('UPDATE positions SET amount = ?, timestamp = ?, asset_id = ? WHERE id = ?').run(
                existing.amount + config.maxPositionSizeUsd,
                now,
                position.assetId,
                existing.id
            );
            console.log(`[TRADER] Updated existing position ${existing.id} (New Total: $${existing.amount + config.maxPositionSizeUsd})`);
        } else {
            // Insert NEW position
            db.prepare('INSERT INTO positions (market_id, outcome, amount, status, entry_price, timestamp, target_user, slug, asset_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
                position.marketId,
                position.outcome,
                config.maxPositionSizeUsd,
                'OPEN',
                limitPrice,
                now,
                event.user,
                position.slug,
                position.assetId
            );
            console.log(`[TRADER] Recorded new position for ${position.slug}`);
        }


    } catch (err: any) {
        console.error('[TRADER] Error executing trade:', err.message);
        sendErrorNotification(err.message);
    }
});

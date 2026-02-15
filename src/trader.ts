import { ClobClient, Side, AssetType } from '@polymarket/clob-client';
import axios from 'axios';
import { SignatureType } from '@polymarket/order-utils';
import { ethers } from 'ethers';
import { config } from './config';
import { monitorEvents } from './monitor';
import db from './db';
import { getMarketFromUserPosition } from './utils';
import { sendTradeNotification, sendErrorNotification } from './telegram';
import { Balances, TradeNotificationData } from './types';

const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
const signer = new ethers.Wallet(config.privateKey || ethers.Wallet.createRandom().privateKey, provider);

let clobClient: ClobClient;
let isTraderReady = false;
let lastTradeTime = 0;
const MIN_TRADE_INTERVAL_MS = 5000; // 5 seconds between trades to prevent draining

// Name mapping for targets
export const TARGET_NAMES: Record<string, string> = {
    '0x818f214c7f3e479cce1d964d53fe3db7297558cb': 'livebreathevolatility'
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

    // 1. Sync User Positions (To seed the local positions table)
    if (ethers.utils.isAddress(userAddress)) {
        try {
            const userRes = await axios.get(`https://data-api.polymarket.com/positions?user=${userAddress}`);
            if (userRes.data && Array.isArray(userRes.data)) {
                let count = 0;
                userRes.data.forEach((p: any) => {
                    const info = db.prepare('INSERT OR IGNORE INTO positions (market_id, outcome, amount, status, entry_price, timestamp, target_user) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                        p.conditionId,
                        p.outcome,
                        parseFloat(p.initialValue),
                        'OPEN',
                        p.avgPrice,
                        Date.now(),
                        'Sync (Pre-existing)'
                    );
                    if (info.changes > 0) count++;
                });
                if (count > 0) console.log(`[SYNC] Seeded ${count} new user positions into DB.`);
            }
        } catch (e: any) {
            console.warn(`[SYNC] Could not fetch positions for user ${userAddress}: ${e.message}`);
        }
    }

    // 2. Sync Target Positions (To mark markets as ineligible)
    for (const target of targets) {
        if (!ethers.utils.isAddress(target)) {
            console.log(`[SYNC] Skipping non-address target: ${target}`);
            continue;
        }

        try {
            const targetRes = await axios.get(`https://data-api.polymarket.com/positions?user=${target}`);
            if (targetRes.data && Array.isArray(targetRes.data)) {
                let count = 0;
                targetRes.data.forEach((p: any) => {
                    const info = db.prepare('INSERT OR IGNORE INTO ineligible_markets (condition_id, reason, timestamp) VALUES (?, ?, ?)').run(
                        p.conditionId,
                        `Target ${target} already active`,
                        Date.now()
                    );
                    if (info.changes > 0) count++;
                });
                if (count > 0) console.log(`[SYNC] Marked ${count} new markets as ineligible from target ${target}.`);
            }
        } catch (e: any) {
            console.warn(`[SYNC] Could not fetch positions for target ${target}: ${e.message}`);
        }
    }
    console.log('[SYNC] Portfolio synchronization complete.');
}

import { CONDITIONAL_TOKENS_ABI, CONDITIONAL_TOKENS_ADDR, USDC_E_ADDR } from './abi';

export async function claimPositions() {
    console.log('[TRADER] Checking for redeemable positions...');
    try {
        const funder = clobClient.orderBuilder.funderAddress || signer.address;
        const posRes = await axios.get(`https://data-api.polymarket.com/positions?user=${funder}`);

        const redeemable = posRes.data.filter((p: any) => p.redeemable === true);

        if (redeemable.length === 0) {
            return "No winning positions to claim.";
        }

        console.log(`[TRADER] Found ${redeemable.length} redeemable positions.`);
        let claimCount = 0;

        for (const pos of redeemable) {
            try {
                console.log(`[TRADER] Claiming: ${pos.title} (${pos.outcome})`);

                // Polymarket Binary markets use a simple indexSet: [1] for Outcome 0 (Yes), [2] for Outcome 1 (No)
                // Actually, the indexSet is a bitmask. For a 2-outcome market:
                // Outcome 0: indexSet = 1 << 0 = 1
                // Outcome 1: indexSet = 1 << 1 = 2
                const indexSet = [1 << pos.outcomeIndex];

                const ctf = new ethers.Contract(CONDITIONAL_TOKENS_ADDR, CONDITIONAL_TOKENS_ABI, signer);

                // If using a Proxy, we usually need to execute this via the Proxy if the tokens are held there
                // However, redeemPositions can often be called by anyone as long as they specify the correct 'owner' 
                // Wait, most implementations of ConditionalTokens require the msg.sender to be the owner or authorized.
                // Our Proxy (Gnosis Safe) holds the tokens.

                // For Gnosis Safe, we'd need to encode the call and send it via the safe.
                // But let's check if the SDK has a helper. (It doesn't seem to have a direct one).

                // Let's implement a direct call first, and if it fails due to Proxy ownership, we'll note it.
                // Note: Simple 'redeemPositions' doesn't take an 'owner' arg, it redeems for msg.sender.

                // If funder is Proxy, we MUST exeucte via Proxy.
                if (config.proxyAddress) {
                    console.log(`[TRADER] Executing redemption via Proxy: ${config.proxyAddress}`);
                    // Encoding the CTF call
                    const data = ctf.interface.encodeFunctionData("redeemPositions", [
                        USDC_E_ADDR,
                        ethers.constants.HashZero, // parentCollectionId
                        pos.conditionId,
                        indexSet
                    ]);

                    // Gnosis Safe 'execTransaction' or similar would be needed here.
                    // This is complex. Let's try the direct call first and see if the user's setup allows it.
                    // Actually, if the tokens are in the Proxy, msg.sender MUST be the Proxy.

                    // TODO: Implement Gnosis Safe transaction execution if direct call fails.
                    // For now, we attempt direct call for simplicity.
                }

                const tx = await ctf.redeemPositions(
                    USDC_E_ADDR,
                    ethers.constants.HashZero,
                    pos.conditionId,
                    indexSet,
                    {
                        gasLimit: 200000,
                        maxPriorityFeePerGas: ethers.utils.parseUnits('35', 'gwei'),
                        maxFeePerGas: ethers.utils.parseUnits('60', 'gwei')
                    }
                );

                console.log(`[TRADER] Redemption Tx sent: ${tx.hash}`);
                await tx.wait();

                // Update DB
                db.prepare('UPDATE positions SET status = ? WHERE market_id = ? AND outcome = ?').run('CLOSED', pos.conditionId, pos.outcome);
                claimCount++;
            } catch (err: any) {
                console.error(`[TRADER] Failed to claim ${pos.conditionId}:`, err.message);
            }
        }

        return `✅ Claimed ${claimCount} positions.`;
    } catch (e: any) {
        console.error('[TRADER] Error in claimPositions:', e.message);
        return `❌ Error: ${e.message}`;
    }
}

export async function closeAllPositions() {
    console.log('[TRADER] Closing all open positions...');
    const positions = db.prepare('SELECT * FROM positions WHERE status = ?').all('OPEN') as any[];

    if (positions.length === 0) {
        return "No open positions to close.";
    }

    let closedCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const pos of positions) {
        try {
            console.log(`[TRADER] Closing position: ${pos.market_id} (${pos.outcome})`);

            const funder = clobClient.orderBuilder.funderAddress || signer.address;
            const posRes = await axios.get(`https://data-api.polymarket.com/positions?user=${funder}`);
            const livePos = posRes.data.find((p: any) => p.conditionId === pos.market_id);

            if (!livePos || parseFloat(livePos.size) <= 0) {
                console.log(`[TRADER] Position ${pos.market_id} has 0 balance on-chain. Marking as CLOSED.`);
                db.prepare('UPDATE positions SET status = ? WHERE market_id = ? AND outcome = ?').run('CLOSED', pos.market_id, pos.outcome);
                closedCount++;
                continue;
            }

            const size = Math.floor(parseFloat(livePos.size));
            const assetId = livePos.asset;

            // 1. Fetch correct Fee Rate for this specific market
            let feeRateBps = 0;
            try {
                feeRateBps = await clobClient.getFeeRateBps(assetId);
                console.log(`[TRADER] Fee Rate for ${pos.market_id}: ${feeRateBps} BPS`);
            } catch (feeErr: any) {
                console.warn(`[TRADER] Could not fetch fee for ${assetId}, trying 0: ${feeErr.message}`);
            }

            // 2. Place Sell Order
            const orderArgs = {
                tokenID: assetId,
                price: 0.001,
                side: Side.SELL,
                size: size,
                feeRateBps: feeRateBps
            };

            const response = await clobClient.createAndPostOrder(orderArgs);
            console.log(`[TRADER] Sell Order Response for ${pos.market_id}:`, response);

            if ((response as any).status === 'OK' || (response as any).status === 'success' || (response as any).status === 200) {
                db.prepare('UPDATE positions SET status = ? WHERE market_id = ? AND outcome = ?').run('CLOSED', pos.market_id, pos.outcome);
                closedCount++;
            } else {
                const errorMsg = (response as any).error || JSON.stringify(response);
                if (errorMsg.includes("orderbook") && errorMsg.includes("not exist")) {
                    console.warn(`[TRADER] Orderbook for ${pos.market_id} does not exist. Skipping.`);
                    skipCount++;
                    db.prepare('UPDATE positions SET status = ? WHERE market_id = ? AND outcome = ?').run('CLOSED', pos.market_id, pos.outcome);
                } else {
                    throw new Error(errorMsg);
                }
            }

        } catch (e: any) {
            console.error(`[TRADER] Failed to close position ${pos.market_id}:`, e.message);
            errorCount++;
        }
    }

    return `✅ Cerradas ${closedCount} posiciones.${skipCount > 0 ? ` ⏭️ Omitidas ${skipCount} (Sin orderbook).` : ''}${errorCount > 0 ? ` ⚠️ ${errorCount} errores.` : ''}`;
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
                    console.warn('❌ NOT ENOUGH BALANCE. Bot will wait.');
                    const now = Date.now();
                    if (now - lastBalanceErrorTime > BALANCE_ERROR_THROTTLE_MS) {
                        sendErrorNotification(`Not enough balance: ${cashNum} USDC.e (Error will be throttled for 1 hour)`);
                        lastBalanceErrorTime = now;
                    }
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
    if (!isTraderReady) {
        console.log(`[TRADER] Not ready yet. Skipping trade detection from ${event.txHash}`);
        return;
    }

    const now = Date.now();
    if (now - lastTradeTime < MIN_TRADE_INTERVAL_MS) {
        console.log(`[TRADER] Cooldown active. Skipping trade from ${event.txHash} (Target is trading too fast)`);
        return;
    }

    lastTradeTime = now;

    // Wait for indexing (Data API can be slow)
    await new Promise(r => setTimeout(r, 5000));

    try {
        // 1. Resolve Asset -> Market
        const position = await getMarketFromUserPosition(event.user, event.makerAssetId) ||
            await getMarketFromUserPosition(event.user, event.takerAssetId);

        if (!position) {
            console.log(`[TRADER] Could not resolve market for asset involved in ${event.txHash}`);
            return;
        }

        console.log(`[TRADER] Resolved: Market=${position.slug}, Outcome=${position.outcome} (${position.assetId})`);

        // 2. Filter Duplicates and Ineligible Markets
        const existing = db.prepare('SELECT status FROM positions WHERE market_id = ? AND status = ?').get(position.marketId, 'OPEN') as { status: string } | undefined;
        if (existing) {
            console.log(`[TRADER] Skipping ${position.slug}: Already active in our positions.`);
            return;
        }

        const ineligible = db.prepare('SELECT reason FROM ineligible_markets WHERE condition_id = ?').get(position.marketId) as { reason: string } | undefined;
        if (ineligible) {
            console.log(`[TRADER] Skipping ${position.slug}: Market is ineligible (${ineligible.reason})`);
            return;
        }

        // 3. Calculate $1 Amount
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

        // Ensure we hit the $1 minimum by using ceil
        const rawSize = config.maxPositionSizeUsd / bestAsk;
        const size = Math.ceil(rawSize);

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

        const response = await clobClient.createAndPostOrder(orderArgs);

        console.log('[TRADER] Order Executed:', response);

        if ((response as any).status !== 'OK' && (response as any).status !== 200 && (response as any).status !== 'success' && (response as any).status !== 'OK') {
            console.error('[TRADER] Order Failed Response:', JSON.stringify(response));
            const errMsg = (response as any).error || (response as any).message || 'Unknown error';
            throw new Error(`PolyMarket API Error: ${errMsg}`);
        }

        // Record ONLY if successful
        db.prepare('INSERT INTO positions (market_id, outcome, amount, status, entry_price, timestamp, target_user) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            position.marketId,
            position.outcome,
            config.maxPositionSizeUsd,
            'OPEN',
            bestAsk,
            Date.now(),
            event.user
        );

        // Fetch latest balances for notification
        const finalBalances = await getBalances();

        const notificationData: TradeNotificationData = {
            targetUser: event.user,
            targetName: TARGET_NAMES[event.user.toLowerCase()],
            marketSlug: position.slug,
            marketId: position.marketId,
            side: 'BUY',
            outcome: position.outcome,
            amountUsd: config.maxPositionSizeUsd,
            price: bestAsk,
            txHash: (response as any)?.orderHash || (response as any)?.transactionHash || 'PENDING',
            newBalance: `${finalBalances.cash} USDC (Portfolio: $${finalBalances.portfolio})`
        };
        sendTradeNotification(notificationData);

    } catch (err: any) {
        console.error('[TRADER] Error executing trade:', err.message);
        sendErrorNotification(err.message);
    }
});

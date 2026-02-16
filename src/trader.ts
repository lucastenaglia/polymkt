import { ClobClient, Side, AssetType } from '@polymarket/clob-client';
import axios from 'axios';
import { SignatureType } from '@polymarket/order-utils';
import { ethers } from 'ethers';
import { config } from './config';
import { monitorEvents } from './monitor';
import db from './db';
import { getMarketFromUserPosition, cacheMarket } from './utils';
import { sendTradeNotification, sendErrorNotification } from './telegram';
import { Balances, TradeNotificationData, Position } from './types';

// ... (rest of imports)

// ... (existing code)

export async function closeSpecificPosition(position: Position) {
    if (!clobClient || !signer) return;

    try {
        const marketID = position.market_id; // Correction: Position interface uses snake_case in DB but might be mapped. Let's check type.
        // Actually, the Position type might use camelCase if mapped, or snake_case if raw DB.
        // Let's assume raw DB for now as that's what we get from 'db.prepare(...).get()'.

        const outcome = position.outcome; // 'Yes' or 'No'

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

        console.log(`[CLOSING] Token0: ${JSON.stringify(token0)}`);

        const t0Id = token0.tokenId || token0.token_id;
        const t1Id = token1.tokenId || token1.token_id;

        if (!t0Id || !t1Id) {
            console.error(`[CLOSING] Could not find token ID in objects. Keys: ${Object.keys(token0)}`);
            return;
        }

        console.log(`[CLOSING] Checking balances for Tokens: ${t0Id}, ${t1Id}`);

        const funder = config.proxyAddress || signer.address;
        const ctf = new ethers.Contract(CONDITIONAL_TOKENS_ADDR, CONDITIONAL_TOKENS_ABI, signer);
        const balance0 = await ctf.balanceOf(funder, t0Id);
        const balance1 = await ctf.balanceOf(funder, t1Id);

        console.log(`[CLOSING] B0 (${funder}): ${balance0?.toString()}, B1: ${balance1?.toString()}`);

        const updates = [];

        if (balance0 && balance0.gt(0)) {
            console.log(`[CLOSING] Selling Token 0 (Balance: ${balance0.toString()})...`);
            await clobClient.createAndPostOrder({
                tokenID: t0Id,
                price: 0.001, // Market Sell (Dump)
                side: Side.SELL,
                size: parseFloat(ethers.utils.formatUnits(balance0, 6)),
                feeRateBps: 0,
            });
            updates.push('Token0');
        }

        if (balance1.gt(0)) {
            console.log(`[CLOSING] Selling Token 1 (Balance: ${balance1.toString()})...`);
            await clobClient.createAndPostOrder({
                tokenID: t1Id,
                price: 0.001,
                side: Side.SELL,
                size: parseFloat(ethers.utils.formatUnits(balance1, 6)),
                feeRateBps: 0,
            });
            updates.push('Token1');
        }

        if (updates.length > 0) {
            db.prepare('UPDATE positions SET status = ? WHERE id = ?').run('CLOSED', position.id);
            console.log(`[CLOSING] Successfully closed position ${position.id} on-chain. Marked as CLOSED in DB.`);

            const notificationData: TradeNotificationData = {
                targetUser: position.target_user || 'Unknown',
                targetName: 'Bot',
                marketSlug: position.market_id,
                marketId: position.market_id,
                side: 'SELL',
                outcome: position.outcome,
                amountUsd: position.amount,
                price: 'Market',
                txHash: 'Market Sell',
                newBalance: '...'
            };
            sendTradeNotification(notificationData);
        } else {
            // If we are here, balance was 0 but we tried to close it. 
            // In Proxy Mode, if the balance check says 0, maybe we should still mark as closed to avoid loops?
            // Actually, if balance is 0, we can safely mark as CLOSED because there is nothing left to sell.
            console.log(`[CLOSING] On-chain balance is 0 for ${position.market_id}. Marking as CLOSED to sync DB.`);
            db.prepare('UPDATE positions SET status = ? WHERE id = ?').run('CLOSED', position.id);
        }

    } catch (e: any) {
        console.error('[TRADER] Error closing position:', e.message);
    }
}


const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
const signer = new ethers.Wallet(config.privateKey || ethers.Wallet.createRandom().privateKey, provider);

let clobClient: ClobClient;
let isTraderReady = false;
let isPaused = false; // Default: Running
let lastTradeTime = 0;
const MIN_TRADE_INTERVAL_MS = 5000; // 5 seconds between trades to prevent draining

// Safety Limits
const lastTradePerMarketOutcome: Record<string, number> = {};
const TRADE_COOLDOWN_MS = 60000; // 1 minute per market/outcome
const MAX_TOTAL_POSITION_SIZE_USD = 10.0; // Don't exceed $10 in one outcome

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
        // We set a hard floor of 30 Gwei for priority fee.
        const minPriorityFee = ethers.utils.parseUnits('30', 'gwei');
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
        let maxFee = baseFee.add(maxPriorityFee).mul(130).div(100); // 30% margin on top of base+tip

        // Cap maxFee at 500 Gwei to avoid "exceeds cap" errors unless market is insane
        const capWeight = ethers.utils.parseUnits('500', 'gwei');
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
                gasLimit: 600000,
                maxPriorityFeePerGas: maxPriorityFee,
                maxFeePerGas: maxFee
            }
        );

        console.log(`[TRADER] Proxy Redemption Tx sent: ${tx.hash}. Waiting for confirmation...`);
        const receipt = await tx.wait(1); // Wait for at least 1 confirmation
        console.log(`✅ Proxy Redemption Confirmed in block ${receipt.blockNumber}`);
        return true;
    } catch (e: any) {
        console.log(`[TRADER] Safe execTransaction skipped or failed: ${e.message}`);
        // If it's a rate limit or fee cap error, propagate it to stop the loop
        if (e.message.includes('rate limit') || e.message.includes('429') || e.message.includes('exceeds the configured cap')) {
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
                gasLimit: 400000,
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
    console.log('[TRADER] Checking for redeemable positions...');
    try {
        const funder = clobClient?.orderBuilder?.funderAddress || config.proxyAddress || signer.address;
        const posRes = await axios.get(`https://data-api.polymarket.com/positions?user=${funder}`);

        const redeemable = posRes.data.filter((p: any) => p.redeemable === true);

        if (redeemable.length === 0) {
            console.log('[TRADER] No redeemable positions found.');
            return "No winning positions to claim.";
        }

        console.log(`[TRADER] Found ${redeemable.length} redeemable positions.`);
        let successCount = 0;

        for (const pos of redeemable) {
            try {
                console.log(`[TRADER] Attempting Claim for: ${pos.title || pos.conditionId}`);

                if (config.proxyAddress) {
                    await redeemViaProxy(config.proxyAddress, pos.conditionId, pos.outcomeIndex);
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
                    console.log(`[TRADER] EOA Redemption Tx sent: ${tx.hash}. Waiting for confirmation...`);
                    await tx.wait(1);
                }

                db.prepare('UPDATE positions SET status = ? WHERE market_id = ? AND outcome = ?').run('CLOSED', pos.conditionId, pos.outcome);
                successCount++;

                // Increase delay to 10s to avoid RPC "Too many requests"
                console.log('[TRADER] Waiting 10s before next claim to respect RPC limits...');
                await new Promise(r => setTimeout(r, 10000));
            } catch (err: any) {
                console.error(`[TRADER] ❌ Failed to claim ${pos.conditionId}:`, err.message);
                if (err.message.includes('429') || err.message.includes('rate limit')) {
                    console.warn('[TRADER] RPC Rate limit hit. Skipping further claims this round.');
                    break;
                }
                if (err.message.includes('exceeds the configured cap')) {
                    console.error('[TRADER] Fee exceeds node cap. This might be a temporary RPC issue.');
                    break;
                }
            }
        }

        if (successCount === 0 && redeemable.length > 0) {
            return `❌ Error: No se pudo cobrar ninguna de las ${redeemable.length} posiciones (posible congestión o límite de RPC).`;
        }

        return `✅ Reclamadas ${successCount} de ${redeemable.length} posiciones ganadoras.`;
    } catch (e: any) {
        console.error('[TRADER] Error in claimPositions:', e.message);
        return `❌ Error: ${e.message}`;
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

        // 2. Filter Duplicates (MODIFIED: Allow Add-ons)
        // We used to return here if 'existing' was found. 
        // Now we just fetch it to decide whether to INSERT or UPDATE later.
        const existing = db.prepare('SELECT * FROM positions WHERE market_id = ? AND status = ?').get(position.marketId, 'OPEN') as Position | undefined;

        if (existing) {
            console.log(`[TRADER] Existing position found for ${position.slug}. Current Amount: $${existing.amount}`);

            // Check Max Exposure
            if (existing.amount >= MAX_TOTAL_POSITION_SIZE_USD) {
                console.log(`[TRADER] 🛡️ MAX EXPOSURE HIT ($${existing.amount}). Skipping additional buy for ${position.slug}`);
                return;
            }

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

        const response = await clobClient.createAndPostOrder(orderArgs);

        console.log('[TRADER] Order Executed:', response);

        const res = response as any;
        const isSuccess = res.status === 'OK' || res.status === 200 || res.status === 'success' || res.status === 'matched' || res.success === true;

        if (!isSuccess) {
            console.error('[TRADER] Order Failed Response:', JSON.stringify(response));
            const errMsg = res.error || res.message || 'Unknown error';
            throw new Error(`PolyMarket API Error: ${errMsg}`);
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
            const newAmount = existing.amount + config.maxPositionSizeUsd;
            // Update amount and timestamp. Keep original entry_price? 
            // Or update entry_price to weighted avg? 
            // Let's just update timestamp for now to show activity.
            db.prepare('UPDATE positions SET amount = ?, timestamp = ? WHERE id = ?').run(newAmount, Date.now(), existing.id);
            console.log(`[TRADER] Updated existing position ${existing.id} (New Total: $${newAmount})`);
        } else {
            // Insert NEW position
            db.prepare('INSERT INTO positions (market_id, outcome, amount, status, entry_price, timestamp, target_user, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
                position.marketId,
                position.outcome,
                config.maxPositionSizeUsd,
                'OPEN',
                limitPrice,
                Date.now(),
                event.user,
                position.slug
            );
            console.log(`[TRADER] Recorded new position for ${position.slug}`);
        }


    } catch (err: any) {
        console.error('[TRADER] Error executing trade:', err.message);
        sendErrorNotification(err.message);
    }
});

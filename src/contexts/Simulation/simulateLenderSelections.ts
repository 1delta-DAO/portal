// src/utils/simulateLenderSelections.ts
import { BalanceData, PoolData, UserConfig } from "@1delta/margin-fetcher"
import { type LenderOperationSelection, type LenderOperationKind } from "../LenderSelectionContext"
import { FlattenedPoolWithUserData, PositionTotals, UserConfigs } from "../../hooks/lending/prepareMixedData"
import { RawCurrency } from "@1delta/lib-utils"

export interface AssetBalanceSnapshot {
    asset: RawCurrency
    /** Running raw token balance for this asset at this point in the sequence */
    amount: number
    /** Running USD value of that balance (signed, same direction as amount) */
    amountUsd: number
}

export interface SimulatedActionState {
    selectionId: string
    lender: string
    subAccount: string
    poolId: string
    operation: LenderOperationKind
    amount: string
    amountUsd: number
    balanceBefore: BalanceData
    balanceAfter: BalanceData

    /** Optional asset identifier for this step (chainId:address) */
    assetKey?: string
    /** Running single-asset balance before this step (if assetKey present) */
    assetBalanceBefore?: AssetBalanceSnapshot
    /** Running single-asset balance after this step (if assetKey present) */
    assetBalanceAfter?: AssetBalanceSnapshot
}

export interface SimulationResult {
    steps: SimulatedActionState[]
    finalByLender: {
        [lender: string]: {
            [subAccount: string]: BalanceData
        }
    }
    /**
     * Final running balances per asset across the whole sequence.
     * Keyed as `${chainId}:${address.toLowerCase()}`.
     */
    finalAssetBalances: {
        [assetKey: string]: AssetBalanceSnapshot
    }
}

export type AmountUsdResolver = (selection: LenderOperationSelection, pool: FlattenedPoolWithUserData) => number

export type AdjustForActionFn = (
    balanceIn: BalanceData,
    pool: PoolData,
    amountUsd: number,
    action: LenderOperationKind,
    userConfig: UserConfig
) => BalanceData

// helper: empty balance (if lender/subAccount not present in PositionTotals)
function createEmptyBalanceData(): BalanceData {
    return {
        rewards: undefined,
        borrowDiscountedCollateral: 0,
        borrowDiscountedCollateralAllActive: 0,
        collateral: 0,
        collateralAllActive: 0,
        deposits: 0,
        debt: 0,
        adjustedDebt: 0,
        nav: 0,
        deposits24h: 0,
        debt24h: 0,
        nav24h: 0,
    }
}

/** parse token amount string like "1.23" or "1,23" into a number */
function parseTokenAmount(raw: string): number {
    if (!raw) return 0
    const normalized = raw.replace(/,/g, "")
    const n = parseFloat(normalized)
    return Number.isFinite(n) ? n : 0
}

/**
 * Simulate a sequence of lender operations, threaded through BalanceData
 * per lender and subAccount, and track running single-asset balances.
 *
 * - Uses positionTotals as the starting state
 * - Applies selections in order
 * - Only operations on the same lender share & mutate the same BalanceData
 * - Tracks running balances per asset: `${chainId}:${address}`
 * - Returns per-step before/after and final balances
 *
 * NOTE: For now we assume all actions target subAccount "0".
 *       Later you can add a subAccount field to selection if needed.
 */
export function simulateLenderSelections(
    selections: LenderOperationSelection[],
    positionTotals: PositionTotals,
    userConfigs: UserConfigs,
    adjustForAction: AdjustForActionFn,
    resolveAmountUsd: AmountUsdResolver,
    opts?: {
        /** Which subAccount do these operations target? Default "0". */
        defaultSubAccount?: string
    }
): SimulationResult {
    const defaultSubAccount = opts?.defaultSubAccount ?? "0"

    // mutable running lender balances while we simulate
    const runningBalances: SimulationResult["finalByLender"] = {}

    // initialize runningBalances from positionTotals
    for (const [lender, subMap] of Object.entries(positionTotals)) {
        if (!runningBalances[lender]) runningBalances[lender] = {}
        for (const [subId, { balanceData }] of Object.entries(subMap)) {
            runningBalances[lender][subId] = { ...balanceData }
        }
    }

    // mutable running per-asset balances (raw & USD)
    const runningAssetBalances: SimulationResult["finalAssetBalances"] = {}

    const steps: SimulatedActionState[] = []

    for (const sel of selections) {
        const pool = sel.pool
        if (!pool) {
            // skip selections without a chosen pool
            continue
        }

        const lender = pool.lender
        const subAccount = defaultSubAccount

        // ensure lender/subAccount entry exists
        if (!runningBalances[lender]) {
            runningBalances[lender] = {}
        }
        if (!runningBalances[lender][subAccount]) {
            runningBalances[lender][subAccount] = createEmptyBalanceData()
        }

        const balanceBefore = runningBalances[lender][subAccount]
        const amountUsd = resolveAmountUsd(sel, pool)

        // determine asset identity (chainId + address) if possible
        const asset = pool.asset as any
        const chainId = asset?.chainId ?? pool.chainId
        const addressRaw = asset?.address ?? asset?.addr
        const address = typeof addressRaw === "string" ? addressRaw.toLowerCase() : undefined
        const assetKey = chainId != null && address ? `${chainId}:${address}` : undefined

        // read current asset balance before this step
        const assetBefore =
            assetKey && runningAssetBalances[assetKey]
                ? runningAssetBalances[assetKey]
                : {
                      asset: pool.asset,
                      amount: 0,
                      amountUsd: 0,
                  }

        // no-op if amount resolves to NaN or <= 0
        if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
            steps.push({
                selectionId: sel.id,
                lender,
                subAccount,
                poolId: pool.poolId,
                operation: sel.operation,
                amount: sel.amount,
                amountUsd: 0,
                balanceBefore,
                balanceAfter: balanceBefore,
                assetKey,
                assetBalanceBefore: assetKey ? assetBefore : undefined,
                assetBalanceAfter: assetKey ? assetBefore : undefined,
            })
            continue
        }

        // --- per-asset running balance update ---
        const tokenAmount = parseTokenAmount(sel.amount)

        // direction:
        // - deposits & repays DECREASE the user's external balance of that asset
        // - borrows & withdrawals INCREASE it
        let tokenDelta = 0
        let usdDelta = 0

        if (tokenAmount > 0) {
            switch (sel.operation) {
                case "deposit":
                case "repay":
                    tokenDelta = -tokenAmount
                    usdDelta = -amountUsd
                    break
                case "borrow":
                case "withdraw":
                    tokenDelta = tokenAmount
                    usdDelta = amountUsd
                    break
                default:
                    tokenDelta = 0
                    usdDelta = 0
            }
        }

        const assetAfter: AssetBalanceSnapshot = {
            asset: pool?.asset!,
            amount: assetBefore.amount + tokenDelta,
            amountUsd: assetBefore.amountUsd + usdDelta,
        }

        if (assetKey) {
            runningAssetBalances[assetKey] = assetAfter
        }

        // --- lender/subAccount balance update via adjustor ---
        const balanceAfter = adjustForAction(
            balanceBefore,
            pool.poolData as PoolData,
            amountUsd,
            sel.operation,
            userConfigs[lender]?.[subAccount] ?? {
                selectedMode: 0,
                id: "0",
            }
        )

        // store new running balance
        runningBalances[lender][subAccount] = balanceAfter

        // push step record
        steps.push({
            selectionId: sel.id,
            lender,
            subAccount,
            poolId: pool.poolId,
            operation: sel.operation,
            amount: sel.amount,
            amountUsd,
            balanceBefore,
            balanceAfter,
            assetKey,
            assetBalanceBefore: assetKey ? assetBefore : undefined,
            assetBalanceAfter: assetKey ? assetAfter : undefined,
        })
    }

    return {
        steps,
        finalByLender: runningBalances,
        finalAssetBalances: runningAssetBalances,
    }
}

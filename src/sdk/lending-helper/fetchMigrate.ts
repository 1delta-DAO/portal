import { BACKEND_BASE_URL } from '../../config/backend'
import type { LendingActionResponse } from './fetchLendingAction'

/**
 * Move a whole debt + collateral position from one lender to another in a
 * single flash-loan transaction. Hits `GET /v1/actions/loop/migrate`
 * (composer bundle: flash the debt → repay the source → withdraw the source
 * collateral → deposit it to the target → borrow the debt from the target →
 * repay the flash).
 *
 * The four market identifiers describe the source (FROM) and target (TO)
 * collateral + debt markets. The HTTP route builds **same-asset** moves: the
 * source/target collateral must be the same underlying, and likewise for debt
 * (an asset conversion / swap leg goes through the SDK). See the worker
 * `loop-migrate` OpenAPI.
 */
export interface MigrateParams {
  /** Source collateral market (`lender:chainId:address`) — moved FROM. */
  marketUidSourceCollateral: string
  /** Source debt market (`lender:chainId:address`). */
  marketUidSourceDebt: string
  /** Target collateral market (`lender:chainId:address`) — moved TO. */
  marketUidTargetCollateral: string
  /** Target debt market (`lender:chainId:address`). */
  marketUidTargetDebt: string
  /** Borrower / tx sender. */
  operator: string
  /**
   * Live debt to migrate, in the debt asset's wei. The flash is sized a small
   * buffer above this server-side so the source repay clears in full (a
   * residual would make the full collateral withdrawal revert).
   */
  debtAmount: string
  /**
   * Withdraw the full source collateral balance (default true). Leave true for
   * a same-asset move so the whole position is carried across.
   */
  isMaxIn?: boolean
  /**
   * Per-position id where the lender needs one (Fluid NFT id, Euler sub-account).
   * Sent as the SOURCE side's id (`accountIdFrom`) — a Fluid source's NFT must be
   * respected for the custody transfer. Defaults to 0. Use `accountIdTo` for a
   * target that needs its own position id.
   */
  accountId?: string
  /** Explicit target-side position id (Fluid NFT on the target). Defaults to 0. */
  accountIdTo?: string
  /**
   * Lista fixed-term broker source only: the loan `posId` to repay (or
   * `type(uint128).max` for the flex/dynamic position). Required when the
   * source debt market is brokered.
   */
  loanId?: string
  /** Aave interest mode of the source debt (repay). 2 = variable (default). */
  irModeFrom?: number
  /** Aave interest mode of the target debt (borrow). 2 = variable (default). */
  irModeTo?: number
  /** Swap-leg slippage as a fraction (0.005 = 0.5%). Only used when a leg is
   *  converted via an aggregator swap. Defaults server-side to 0.5%. */
  slippage?: number
  /** Target collateral deposit APR as a fraction (0.05 = 5%) — drives `result.apr.net`. */
  depositApr?: number
  /** Target debt borrow APR as a fraction (0.05 = 5%). */
  borrowApr?: number
  /** Target collateral liquidation threshold as a fraction (0.85) — drives `result.healthFactor`. */
  liqThreshold?: number
  /** Fallback collateral USD price (oracle) when the server price feed lacks the token. */
  collateralPriceUsd?: number
  /** Fallback debt USD price (oracle) when the server price feed lacks the token. */
  debtPriceUsd?: number
  /** Source collateral amount in wei (display hint so the result shows collateral for non-Aave sources). */
  collateralAmountHint?: string
  /** Authoritative TARGET collateral decimals (pool metadata) — the swap target's when the collateral converts, else the source's. Overrides the worker token list for the display USD. */
  collateralDecimals?: number
  /** Authoritative TARGET debt decimals (pool metadata) — the swap target's when the debt converts, else the source's. */
  debtDecimals?: number
  /** SOURCE debt decimals, for the from-leg display when the debt is converted. Defaults to `debtDecimals`. */
  sourceDebtDecimals?: number
}

/** One aggregator route in the swap quote-sources overview (display only). */
export interface MigrateSwapCandidate {
  aggregator: string
  amountIn: number
  amountOut: number
  amountInUsd?: number
  amountOutUsd?: number
  priceImpactUsd?: number
  priceImpactPct?: number
  inSymbol?: string
  outSymbol?: string
  inLogoURI?: string
  outLogoURI?: string
}

/** Resulting-position summary returned in `data.result` (see worker `migrateResult`). */
export interface MigratePositionResult {
  from: { lender: string; collateral: any; debt: any }
  to: { lender: string; collateral: any; debt: any }
  netUsd?: number
  leverage?: number
  collateralDust?: any
  apr?: { deposit: number; borrow: number; net: number }
  healthFactor?: number
  /** Aggregator quote-sources for the converted leg (present only for a swap). */
  swap?: {
    leg: 'collateral' | 'debt'
    best?: string
    quotes: MigrateSwapCandidate[]
  }
}

export interface MigrateResult {
  success: boolean
  data?: LendingActionResponse
  /** The resulting-position summary (new position, deltas, APR), when available. */
  result?: MigratePositionResult
  error?: string
}

export async function fetchMigrate(params: MigrateParams): Promise<MigrateResult> {
  try {
    const qs = new URLSearchParams()
    qs.set('marketUidSourceCollateral', params.marketUidSourceCollateral)
    qs.set('marketUidSourceDebt', params.marketUidSourceDebt)
    qs.set('marketUidTargetCollateral', params.marketUidTargetCollateral)
    qs.set('marketUidTargetDebt', params.marketUidTargetDebt)
    qs.set('account', params.operator)
    qs.set('debtAmount', params.debtAmount)
    if (params.isMaxIn !== undefined) qs.set('isMaxIn', String(params.isMaxIn))
    // Send the source position id as `accountIdFrom` so it can never leak onto
    // the target leg (a Fluid source NFT must not become the target's NFT id).
    if (params.accountId != null) qs.set('accountIdFrom', params.accountId)
    if (params.accountIdTo != null) qs.set('accountIdTo', params.accountIdTo)
    if (params.loanId != null) qs.set('loanId', params.loanId)
    if (params.irModeFrom != null) qs.set('irModeFrom', String(params.irModeFrom))
    if (params.irModeTo != null) qs.set('irModeTo', String(params.irModeTo))
    if (params.depositApr != null) qs.set('depositApr', String(params.depositApr))
    if (params.borrowApr != null) qs.set('borrowApr', String(params.borrowApr))
    if (params.liqThreshold != null) qs.set('liqThreshold', String(params.liqThreshold))
    if (params.collateralPriceUsd != null) qs.set('collateralPriceUsd', String(params.collateralPriceUsd))
    if (params.debtPriceUsd != null) qs.set('debtPriceUsd', String(params.debtPriceUsd))
    if (params.collateralAmountHint != null) qs.set('collateralAmountHint', params.collateralAmountHint)
    if (params.collateralDecimals != null) qs.set('collateralDecimals', String(params.collateralDecimals))
    if (params.debtDecimals != null) qs.set('debtDecimals', String(params.debtDecimals))
    if (params.sourceDebtDecimals != null) qs.set('sourceDebtDecimals', String(params.sourceDebtDecimals))
    if (params.slippage != null) qs.set('slippage', String(params.slippage))

    const res = await fetch(`${BACKEND_BASE_URL}/v1/actions/loop/migrate?${qs}`)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        success: false,
        error: `HTTP ${res.status}: ${text || res.statusText}`,
      }
    }

    const json = await res.json()

    if (!json.success) {
      return {
        success: false,
        error: json.error?.message ?? 'API error',
      }
    }

    return {
      success: true,
      data: {
        transactions: json.actions?.transactions ?? [],
        permissions: json.actions?.permissions ?? [],
      },
      result: json.data?.result,
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? 'Unknown error',
    }
  }
}

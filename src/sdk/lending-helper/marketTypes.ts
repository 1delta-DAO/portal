/**
 * The market model for `/v1/data/lending/latest` and
 * `/v1/data/lending/pools/by-config`.
 *
 * `PoolDataItem` is the transformed, view-facing shape of a market — what the
 * lending and looping tabs render a row from. It sits here rather than in the
 * hook that fetches it for the same reason as {@link PoolEntry} in
 * `poolTypes.ts`: an integrator should be able to read the data model without
 * reading a React Query hook.
 *
 * Two market shapes, deliberately:
 *   - `PoolEntry`    (poolTypes.ts)   — `/lending/pools`, string-typed numerics
 *   - `PoolDataItem` (this file)      — `/lending/latest`, numbers, transformed
 * The Earn tab browses the first; the position-management tabs use the second.
 */

import type { AnyTermSheet } from './termSheets'
import type { RewardEntry } from './rewards'
import type { FluidSmartInfo } from './fluidSmart'
import type {
  LenderInfo,
  MarketCapability,
  PoolOracleInfo,
  PoolRisk,
  PoolRiskBreakdown,
  PoolTerm,
} from './poolTypes'

/** Pools grouped by lender key. One level — no chainId wrapping. */
export type LenderData = {
  [lender: string]: PoolDataItem[]
}

/** Lender info map keyed by lender key. */
export type LenderInfoMap = {
  [lender: string]: LenderInfo
}

/**
 * Lightweight per-(chain, lender) summary returned by /lending/lenders.
 * Used to drive the lender dropdown without paying the cost of fetching
 * full per-market data for every lender.
 */
export interface LenderSummary {
  chainId: string
  lenderInfo: LenderInfo
  /** TVL in USD across all of this lender's markets on this chain. */
  tvlUsd: number
  /** Server-side timestamp the underlying data was last refreshed. */
  lastFetched: number
}

export interface PoolDataItem {
  marketUid: string
  name: string
  underlying: string
  asset: PoolAsset
  totalDeposits: number
  totalDebtStable: number
  totalDebt: number
  totalLiquidity: number
  totalDepositsUSD: number
  totalDebtStableUSD: number
  totalDebtUSD: number
  totalLiquidityUSD: number
  depositRate: number
  variableBorrowRate: number
  stableBorrowRate: number
  intrinsicYield: number
  /**
   * Reward programs as the API serves them: one entry per (reward token,
   * source), carrying symbol / logo / sourceLabel / link / endsAt. An ARRAY —
   * it used to be defaulted to `{}`, which discarded all provenance.
   */
  rewards: RewardEntry[]
  /** Summed deposit-side reward APR (percent) from incentive campaigns. */
  depositRewardApr: number
  /** Summed borrow-side reward APR (percent) — a rebate that lowers borrow cost. */
  borrowRewardApr: number
  /** Distinct reward sources (e.g. "merkle", "native") for tooltip display. */
  rewardSources: string[]
  config: Record<string, PoolConfig>
  borrowCap: number
  supplyCap: number
  debtCeiling: number
  collateralActive: boolean
  borrowingEnabled: boolean
  hasStable: boolean
  isActive: boolean
  isFrozen: boolean
  oraclePrice?: number
  oraclePriceUSD?: number
  risk?: PoolRisk | null
  /** Oracle feed-correctness classification (top-level, sibling of `risk`). */
  oracleInfo?: PoolOracleInfo | null
  params?: any
  /**
   * Brokered (Lista) rate card. Non-empty ⇒ fixed-term-only borrowing; offer
   * these terms instead of a variable borrow. See BROKERED_MARKETS.md.
   */
  terms?: PoolTerm[] | null
  /**
   * Canonical fixed-term descriptor (model / maturity / fees / earlyRepay /
   * provider). `/lending/latest` serves it per lender KEY, so the transform
   * hoists it here next to `terms` — this is where `fixedTermDetails()` reads
   * it, and it is what gates the refinance / roll-over button on brokered
   * markets. Absent on variable-rate lenders.
   */
  fixedTerm?: any
  /**
   * Actions this market supports, **declared by the API** (`MarketCapability`
   * on `/lending/latest` and `/lending/pools`).
   *
   * Read this to decide whether to render an action's CTA — never re-derive it
   * from the lender key, the provider kind or the shape of the row. The array
   * is complete over the actions the server models, so an absent action means
   * "not offered here". Same contract as the earn rows' `capabilities[]`.
   */
  capabilities?: MarketCapability[]
  /** True when variable borrowing isn't offered (brokered markets). */
  variableBorrowDisabled?: boolean
  /**
   * Structured description of this market's lend and borrow offer — rate,
   * maturity, fees, exit terms, liquidation, governance, oracle, exposures.
   * One shape for every lender we serve. See `components/lending/terms/`.
   *
   * Typed as `AnyTermSheet` on purpose: the list endpoints default to
   * `?terms=digest`, whose sides hoist `headline`/`tags` to the root and carry
   * NO `info` object — so a `sheet.supply.info.tags` read is a runtime crash,
   * not a type error, once the value crosses the network. Always read it
   * through `sideInfo()` / `isFullSheet()`.
   */
  termSheet?: AnyTermSheet
  /**
   * THIS ROW'S ASSET IS NOT INDEPENDENTLY HOLDABLE — it is one leg of a
   * pool-rebalanced basket, and the split drifts with the pool. Lender-agnostic
   * by design; see {@link PoolEntry.autoBalanced} and `fluidSmart.ts`.
   */
  autoBalanced?: boolean
  /**
   * Fluid smart-vault descriptor (T2/T3/T4 only). Carries the POSITION's rate —
   * the row's own `depositRate` is one LEG's, which is right per dollar but is
   * not the vault's APR. Null everywhere else.
   */
  fluid?: FluidSmartInfo | null
}

export interface PoolAsset {
  chainId: string
  decimals: number
  name: string
  address: string
  symbol: string
  logoURI: string
  assetGroup: string
  currencyId: string
  pendle?: PendleAssetData
  props?: { [key: string]: any }
}

export interface PendleAssetData {
  expiry: number
  syAddress: string
  tokenType: string
  ytAddress: string
  marketAddress: string
}

export interface PoolConfig {
  label: string
  category: number
  borrowFactor: number
  debtDisabled: boolean
  collateralFactor: number
  collateralDisabled: boolean
  borrowCollateralFactor: number
  /**
   * Present when `collateralFactor` above is ONE POINT on a curve the borrower
   * picks from at open (LlamaLend band count) rather than a constant. Quoting a
   * different value means recomputing — not reusing `collateralFactor`.
   */
  openParameter?: {
    kind: 'llamalend-bands' | 'interest-rate'
    dimension: 'collateralFactor' | 'rate'
    domain: { min: number; max: number } | { values: number[] }
    default: number
    immutableAfterOpen: boolean
    adjustCooldownSeconds?: number
  }
}

// ============================================================================
// Types for the /pools/by-config API response
// ============================================================================

export interface PoolConfigGroup {
  lenderKey: string
  chainId: string
  configId: string
  label: string
  category: string
  collaterals: ConfigMarketItem[] | null
  borrowables: ConfigMarketItem[] | null
  configRiskScore: number | null
  configRiskLabel: string | null
  configRiskBreakdown?: PoolRiskBreakdown[]
}

export interface ConfigMarketItem {
  marketUid: string
  depositRate: number
  borrowFactor: number
  totalDebtUsd: number
  intrinsicYield: number | null
  underlyingInfo: {
    asset: {
      name: string
      symbol: string
      address: string
      chainId: string
      logoURI: string
      decimals: number
      assetGroup: string
      currencyId: string
      intrinsicYield: number | null
      props?: Record<string, unknown> | null
    }
    prices: {
      priceUsd: number
      priceUsd24h: number
      priceTs: string
      priceTs24h: string
    } | null
    tokenRisk?: {
      riskLabel: string
      riskScore: number
    } | null
    oraclePrice: {
      oraclePrice: number
      oraclePriceUsd: number
    } | null
  }
  collateralFactor: number
  stableBorrowRate: number
  totalDepositsUsd: number
  variableBorrowRate: number
  borrowCollateralFactor: number
  totalLiquidity?: number
  totalLiquidityUsd?: number
}

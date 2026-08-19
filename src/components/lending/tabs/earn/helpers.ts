import { riskBand } from '../../../../utils/format'
import type { PoolEntry } from '../../../../sdk/lending-helper/poolTypes'
import { totalRewardApr } from '../../shared/rewards'
import type { PoolDataItem } from '../../../../sdk/lending-helper/marketTypes'
import {
  basketIntrinsicYield,
  isAutoBalanced,
  isBasketRate,
  lenderKeyOf,
  positionBorrowRate,
  positionSupplyRate,
} from '../../../../sdk/lending-helper/fluidSmart'

export type SortKey =
  | 'apr'
  | 'utilization'
  | 'totalDepositsUSD'
  | 'totalDebtUSD'
  | 'totalLiquidityUSD'
  | 'totalDeposits'
  | 'totalDebt'
  | 'totalLiquidity'
  | 'borrowRate'
  | 'intrinsicYield'
  | 'riskScore'

/**
 * Derive a risk band from a numeric score (1 best … 5 worst).
 *
 * **1–2 low · 3 medium · 4–5 high.** Four is HIGH, not medium — it was the
 * other way round here while `riskScoreClass` in `terms/format.ts` already
 * used these bands, so the same score rendered amber in one place and red in
 * another. This is now the single definition; everything that bands a score
 * calls it.
 */
export function scoreToRiskLabel(score: number | null | undefined): string {
  if (score == null) return '—'
  return riskBand(score)
}

/**
 * Badge classes for a raw score, banded by {@link scoreToRiskLabel}.
 *
 * Low is deliberately neutral rather than green: most of the book scores 1–2,
 * and a wall of green badges reads as an endorsement of every row rather than
 * as the absence of a warning.
 */
export function riskBadgeClass(score: number | null | undefined): string {
  switch (scoreToRiskLabel(score)) {
    case 'high':
      return 'badge-error'
    case 'medium':
      return 'badge-warning'
    default:
      return 'badge-ghost'
  }
}

export function riskDotColor(label: string): string {
  switch (label) {
    case 'low':
      return 'bg-success'
    case 'medium':
      return 'bg-warning'
    case 'high':
      return 'bg-error'
    default:
      return 'bg-base-content/20'
  }
}

/** Derived values from one pool row. See {@link computePoolMetrics}. */
export interface PoolMetrics {
  utilization: number
  /**
   * The POSITION's supply APR. On an auto-balanced (LP-backed) side this is the
   * basket rate, not this leg's — see {@link computePoolMetrics}.
   */
  apr: number
  borrowApr: number
  intrinsicYield: number
  price: number
  depositRewardApr: number
  borrowRewardApr: number
  /** This leg's own rate, kept whenever `apr` is a basket blend. */
  aprLeg: number
  borrowAprLeg: number
  /** True when `apr` / `borrowApr` describe a basket rather than this leg. */
  isBasketApr: boolean
  isBasketBorrowApr: boolean
}

/**
 * A pool paired with its derived metrics.
 *
 * The metrics are computed ONCE per pool, in `MarketsView`, and then carried
 * through filtering, sorting and rendering. They used to be recomputed inside
 * the sort comparator — which meant `2·n·log n` calls instead of `n` — and
 * again per visible row in `MarketsTable`. Keep them paired; don't re-derive
 * downstream.
 */
export interface PoolWithMetrics {
  pool: PoolEntry
  metrics: PoolMetrics
  /**
   * The other legs of the same vault, when this row stands for a whole
   * auto-balanced position rather than for one market. Set only by
   * {@link collapseSmartVaults}; absent everywhere else, so a table that
   * ignores it renders exactly as before.
   */
  legs?: PoolWithMetrics[]
}

/**
 * Collapse the legs of an auto-balanced vault into ONE row per vault.
 *
 * A Fluid T4 emits up to four rows for one vault — one per underlying LP leg,
 * merged where a token sits on both sides. Rendered flat they are four
 * independent markets at the same LTV, and a user picking "the wstETH one" has
 * no way to know it is the same position as "the ETH one". That is the failure
 * mode AGENTS.md records the earn surface being burned by four times, and it is
 * also a pagination lie: the footer counts legs and calls them pools.
 *
 * The representative leg is the one with the most deposits, not the one that
 * happened to sort first — the row would otherwise swap identity whenever the
 * rates crossed, while still describing the same position. Every leg is kept on
 * `legs` so the detail view can show the split.
 *
 * ORDINARY MARKETS PASS THROUGH UNTOUCHED, including two markets that merely
 * share a lender key: only rows that declare themselves auto-balanced collapse.
 *
 * Runs AFTER filtering and sorting and BEFORE pagination, so a filter still
 * matches on any leg and the page count is in vaults.
 */
export function collapseSmartVaults(rows: PoolWithMetrics[]): PoolWithMetrics[] {
  // Cheap exit for the overwhelmingly common case — no smart vault in the set.
  if (!rows.some((r) => isAutoBalanced(r.pool))) return rows

  const out: PoolWithMetrics[] = []
  const groups = new Map<string, { at: number; legs: PoolWithMetrics[] }>()

  for (const row of rows) {
    if (!isAutoBalanced(row.pool)) {
      out.push(row)
      continue
    }
    // Legs of one vault can live on different chains only in principle; key on
    // both so a cross-chain listing never merges two unrelated vaults.
    const key = `${row.pool.chainId}:${lenderKeyOf(row.pool.marketUid)}`
    const existing = groups.get(key)
    if (existing) {
      existing.legs.push(row)
      continue
    }
    const entry = { at: out.length, legs: [row] }
    groups.set(key, entry)
    out.push(row) // placeholder, rewritten below once every leg is known
  }

  for (const { at, legs } of groups.values()) {
    const primary = legs.reduce((best, leg) =>
      (parseFloat(leg.pool.totalDepositsUsd) || 0) > (parseFloat(best.pool.totalDepositsUsd) || 0)
        ? leg
        : best
    )
    // The intrinsic yield is a TOKEN property, and the collapsed row stands for
    // the whole position — so it must be the value-weighted blend, not the
    // representative leg's. Left as the leg's own value when the weights are
    // unreadable, which is the same fallback every other basket figure uses.
    const pools = legs.map((l) => l.pool)
    const blended = basketIntrinsicYield(
      primary.pool,
      'collateral',
      pools,
      (p) => parseFloat(p.intrinsicYield ?? '') || 0,
      (p) => parseFloat(p.totalDepositsUsd) || 0
    )
    out[at] = {
      ...primary,
      legs,
      metrics: blended === null ? primary.metrics : { ...primary.metrics, intrinsicYield: blended },
    }
  }
  return out
}

/** Compute derived values from pool data */
export function computePoolMetrics(pool: PoolEntry): PoolMetrics {
  const totalDeposits = parseFloat(pool.totalDeposits) || 0
  const totalDebt = parseFloat(pool.totalDebt) || 0

  const utilization = totalDeposits > 0 ? totalDebt / totalDeposits : 0
  const aprLeg = parseFloat(pool.depositRate) || 0
  const borrowAprLeg = parseFloat(pool.variableBorrowRate) || 0
  const intrinsicYield = parseFloat(pool.intrinsicYield ?? '') || 0
  const price = pool.underlyingInfo?.prices?.priceUsd ?? 0

  // A leg of an LP-backed side earns the BASKET's rate, not the rate on the row.
  //
  // This is the single place the earn surface derives an APR, so it is also the
  // single place the "Best APR" ranking gets it right or wrong. `depositRate`
  // on a smart Fluid row is one leg's — correct per DOLLAR, since every dollar
  // in the LP earns the trading yield whichever token it sits in, but not the
  // position's. Ranking on the max over legs read 11.81 % where the vault earns
  // 10.33 %, and three vaults holding $91M between them showed ~0 % because the
  // leg the row named happened to be the idle one.
  //
  // Falls straight through to the leg rate on every non-smart market, which is
  // every market except Fluid T2/T3/T4.
  const apr = positionSupplyRate(pool, aprLeg)
  const borrowApr = positionBorrowRate(pool, borrowAprLeg)

  // Incentive rewards — `rewards` is an array of {depositRate, variableBorrowRate,
  // source, …}; sum each side. Deposit rewards boost earn APR; borrow rewards are
  // a rebate.
  // Points programs excluded — unpriceable, see RewardBadge.
  const depositRewardApr = totalRewardApr(pool.rewards, 'deposit')
  const borrowRewardApr = totalRewardApr(pool.rewards, 'borrow')

  return {
    utilization,
    apr,
    borrowApr,
    intrinsicYield,
    price,
    depositRewardApr,
    borrowRewardApr,
    aprLeg,
    borrowAprLeg,
    isBasketApr: isBasketRate(pool, 'supply'),
    isBasketBorrowApr: isBasketRate(pool, 'borrow'),
  }
}

/** Convert a PoolEntry (from /pools endpoint) into a PoolDataItem for action components */
export function poolEntryToPoolDataItem(entry: PoolEntry): PoolDataItem {
  const info = entry.underlyingInfo
  return {
    marketUid: entry.marketUid,
    name: entry.name,
    underlying: info?.asset?.address || '',
    asset: {
      chainId: info.asset.chainId,
      decimals: info.asset.decimals,
      name: info.asset.name,
      address: info.asset.address,
      symbol: info.asset.symbol,
      logoURI: info.asset.logoURI,
      assetGroup: info.asset.assetGroup,
      currencyId: info.asset.currencyId,
    },
    totalDeposits: parseFloat(entry.totalDeposits) || 0,
    totalDebtStable: 0,
    totalDebt: parseFloat(entry.totalDebt) || 0,
    totalLiquidity: parseFloat(entry.totalLiquidity) || 0,
    totalDepositsUSD: parseFloat(entry.totalDepositsUsd) || 0,
    totalDebtStableUSD: 0,
    totalDebtUSD: parseFloat(entry.totalDebtUsd) || 0,
    totalLiquidityUSD: parseFloat(entry.totalLiquidityUsd) || 0,
    depositRate: parseFloat(entry.depositRate) || 0,
    variableBorrowRate: parseFloat(entry.variableBorrowRate) || 0,
    stableBorrowRate: parseFloat(entry.stableBorrowRate) || 0,
    intrinsicYield: parseFloat(entry.intrinsicYield ?? '') || 0,
    rewards: Array.isArray((entry as any).rewards) ? (entry as any).rewards : [],
    depositRewardApr: totalRewardApr((entry as any).rewards, 'deposit'),
    borrowRewardApr: totalRewardApr((entry as any).rewards, 'borrow'),
    rewardSources: Array.from(
      new Set(
        (Array.isArray((entry as any).rewards) ? (entry as any).rewards : [])
          .map((r: any) => r?.sourceLabel ?? r?.sourceId ?? r?.source)
          .filter(Boolean)
      )
    ) as string[],
    config: {},
    borrowCap: 0,
    supplyCap: 0,
    debtCeiling: 0,
    collateralActive: true,
    borrowingEnabled: true,
    hasStable: false,
    isActive: true,
    isFrozen: false,
    oraclePrice: info.oraclePrice?.oraclePrice ?? undefined,
    oraclePriceUSD: info.oraclePrice?.oraclePriceUsd ?? undefined,
    terms: entry.terms
      ? entry.terms.map((t) => ({
          termId: Number(t.termId),
          durationDays: Number(t.durationDays),
          apr: Number(t.apr),
        }))
      : null,
    variableBorrowDisabled:
      entry.variableBorrowDisabled ?? entry.flags?.variableBorrowDisabled ?? false,
    // The action panel is built from this item, and the deposit form's second
    // input, the exit's share sizing and the T4 two-step close all read these.
    // Dropping them here made a smart market act like an ordinary pool at
    // exactly the point where the difference becomes a transaction.
    autoBalanced: entry.autoBalanced === true,
    fluid: entry.fluid ?? null,
  }
}

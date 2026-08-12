import { riskBand } from '../../../../utils/format'
import type { PoolEntry } from '../../../../sdk/lending-helper/poolTypes'
import { totalRewardApr } from '../../shared/rewards'
import type { PoolDataItem } from '../../../../sdk/lending-helper/marketTypes'

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
  apr: number
  borrowApr: number
  intrinsicYield: number
  price: number
  depositRewardApr: number
  borrowRewardApr: number
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
}

/** Compute derived values from pool data */
export function computePoolMetrics(pool: PoolEntry): PoolMetrics {
  const totalDeposits = parseFloat(pool.totalDeposits) || 0
  const totalDebt = parseFloat(pool.totalDebt) || 0

  const utilization = totalDeposits > 0 ? totalDebt / totalDeposits : 0
  const apr = parseFloat(pool.depositRate) || 0
  const borrowApr = parseFloat(pool.variableBorrowRate) || 0
  const intrinsicYield = parseFloat(pool.intrinsicYield ?? '') || 0
  const price = pool.underlyingInfo?.prices?.priceUsd ?? 0

  // Incentive rewards — `rewards` is an array of {depositRate, variableBorrowRate,
  // source, …}; sum each side. Deposit rewards boost earn APR; borrow rewards are
  // a rebate.
  // Points programs excluded — unpriceable, see RewardBadge.
  const depositRewardApr = totalRewardApr(pool.rewards, 'deposit')
  const borrowRewardApr = totalRewardApr(pool.rewards, 'borrow')

  return { utilization, apr, borrowApr, intrinsicYield, price, depositRewardApr, borrowRewardApr }
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
  }
}

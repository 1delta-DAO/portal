import type { PoolEntry } from '../../../../hooks/lending/useFlattenedPools'
import type { PoolDataItem } from '../../../../hooks/lending/usePoolData'

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

/** Derive a risk label from a numeric score (1–5) */
export function scoreToRiskLabel(score: number | null | undefined): string {
  if (score == null) return '—'
  if (score <= 2) return 'low'
  if (score <= 4) return 'medium'
  return 'high'
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

/** Compute derived values from pool data */
export function computePoolMetrics(pool: PoolEntry) {
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
  const rewardsList = Array.isArray(pool.rewards) ? (pool.rewards as any[]) : []
  const depositRewardApr = rewardsList.reduce((s, r) => s + (Number(r?.depositRate) || 0), 0)
  const borrowRewardApr = rewardsList.reduce(
    (s, r) => s + (Number(r?.variableBorrowRate) || 0),
    0,
  )

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
    rewards: {},
    depositRewardApr: (Array.isArray((entry as any).rewards) ? (entry as any).rewards : []).reduce(
      (s: number, r: any) => s + (Number(r?.depositRate) || 0),
      0,
    ),
    borrowRewardApr: (Array.isArray((entry as any).rewards) ? (entry as any).rewards : []).reduce(
      (s: number, r: any) => s + (Number(r?.variableBorrowRate) || 0),
      0,
    ),
    rewardSources: Array.from(
      new Set(
        (Array.isArray((entry as any).rewards) ? (entry as any).rewards : [])
          .map((r: any) => r?.source)
          .filter(Boolean),
      ),
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
    variableBorrowDisabled: entry.variableBorrowDisabled ?? entry.flags?.variableBorrowDisabled ?? false,
  }
}

import type { PoolEntry } from '../../../hooks/lending/useFlattenedPools'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'

export type SortKey = 'apr' | 'utilization' | 'totalLiquidityUSD' | 'totalDepositsUSD' | 'riskScore'

/** Map a numeric risk score (1–5) to a letter grade (A = best, E = worst) */
export function riskGrade(score: number | null | undefined): string {
  if (score == null) return '—'
  const grades: Record<number, string> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' }
  return grades[score] ?? 'F'
}

export function riskBadgeClass(grade: string): string {
  switch (grade) {
    case 'A':
    case 'B':
      return 'badge-success'
    case 'C':
      return 'badge-warning'
    case 'D':
    case 'E':
      return 'badge-error'
    default:
      return 'badge-ghost'
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

  return { utilization, apr, borrowApr, intrinsicYield, price }
}

/** Convert a PoolEntry (from /pools endpoint) into a PoolDataItem for action components */
export function poolEntryToPoolDataItem(entry: PoolEntry): PoolDataItem {
  const info = entry.underlyingInfo
  return {
    marketUid: entry.marketUid,
    name: entry.name,
    underlying: entry.underlyingAddress,
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
  }
}

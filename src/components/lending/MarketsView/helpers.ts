import type { PoolEntry } from '../../../hooks/lending/useFlattenedPools'
import type { LenderData, PoolDataItem } from '../../../hooks/lending/usePoolData'

export type SortKey = 'apr' | 'utilization' | 'totalLiquidityUSD' | 'totalDepositsUSD'

/** Compute derived values from pool data */
export function computePoolMetrics(pool: PoolEntry) {
  const totalDeposits = parseFloat(pool.totalDeposits) || 0
  const totalDebt = parseFloat(pool.totalDebt) || 0
  const totalDepositsUSD = parseFloat(pool.totalDepositsUsd) || 0

  const utilization = totalDeposits > 0 ? totalDebt / totalDeposits : 0
  const apr = parseFloat(pool.depositRate) || 0
  const borrowApr = parseFloat(pool.variableBorrowRate) || 0
  const intrinsicYield = parseFloat(pool.intrinsicYield ?? '') || 0
  const price = totalDeposits > 0 ? totalDepositsUSD / totalDeposits : 0

  return { utilization, apr, borrowApr, intrinsicYield, price }
}

/** Resolve a PoolEntry to its corresponding PoolDataItem from lenderData */
export function resolvePoolDataItem(
  entry: PoolEntry,
  lenderData: LenderData | undefined
): PoolDataItem | null {
  if (!lenderData) return null
  const pools = lenderData[entry.lenderKey]
  if (!pools) return null
  return (
    pools.find((p) => p.underlying.toLowerCase() === entry.underlyingAddress.toLowerCase()) ?? null
  )
}

import type { PoolEntry } from '../../../hooks/lending/useFlattenedPools'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'

export type SortKey = 'apr' | 'utilization' | 'totalLiquidityUSD' | 'totalDepositsUSD'

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
    oraclePrice: info.oraclePrice?.oraclePrice,
    oraclePriceUSD: info.oraclePrice?.oraclePriceUSD,
  }
}

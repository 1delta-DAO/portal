import type { PoolConfig, PoolDataItem } from '../../../hooks/lending/usePoolData'

export type SortKey =
  | 'symbol'
  | 'depositApr'
  | 'borrowApr'
  | 'totalDepositsUSD'
  | 'totalDebtUSD'
  | 'totalLiquidityUSD'

/**
 * Compute the max LTV from a pool's config entries.
 * Only considers entries where collateral is enabled.
 */
export function getMaxLtv(
  config: Record<string, PoolConfig>
): { max: number; allSame: boolean } | null {
  const factors = Object.values(config)
    .filter((c) => c.borrowCollateralFactor > 0 && !c.collateralDisabled)
    .map((c) => c.borrowCollateralFactor)
  if (factors.length === 0) return null
  const max = Math.max(...factors)
  const allSame = factors.every((f) => f === max)
  return { max, allSame }
}

/** Filter and sort pools by search query + sort key/direction. */
export function sortPools(
  pools: PoolDataItem[],
  search: string,
  sortKey: SortKey,
  sortDir: 'asc' | 'desc'
): PoolDataItem[] {
  let result = pools

  if (search.trim()) {
    const q = search.toLowerCase()
    result = result.filter(
      (p) =>
        p.asset.symbol.toLowerCase().includes(q) ||
        p.asset.name.toLowerCase().includes(q) ||
        p.asset.address.toLowerCase().includes(q)
    )
  }

  return [...result].sort((a, b) => {
    let aVal: number | string
    let bVal: number | string
    switch (sortKey) {
      case 'symbol':
        aVal = a.asset.symbol.toLowerCase()
        bVal = b.asset.symbol.toLowerCase()
        break
      case 'depositApr':
        aVal = a.depositRate
        bVal = b.depositRate
        break
      case 'borrowApr':
        aVal = a.variableBorrowRate
        bVal = b.variableBorrowRate
        break
      case 'totalDepositsUSD':
        aVal = a.totalDepositsUSD
        bVal = b.totalDepositsUSD
        break
      case 'totalDebtUSD':
        aVal = a.totalDebtUSD
        bVal = b.totalDebtUSD
        break
      case 'totalLiquidityUSD':
        aVal = a.totalLiquidityUSD
        bVal = b.totalLiquidityUSD
        break
      default:
        aVal = 0
        bVal = 0
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })
}

import type { PoolConfig, PoolDataItem } from '../../../sdk/lending-helper/marketTypes'
import { positionBorrowRate, positionSupplyRate } from '../../../sdk/lending-helper/fluidSmart'

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
      // Rank on the POSITION's rate. On an LP-backed side the row's own
      // `depositRate` is one leg's — right per dollar, but not what the vault
      // earns — so sorting on it puts the wrong market at the top. Falls
      // through to the row's rate on every ordinary market.
      case 'depositApr':
        aVal = positionSupplyRate(a, a.depositRate)
        bVal = positionSupplyRate(b, b.depositRate)
        break
      case 'borrowApr':
        aVal = positionBorrowRate(a, a.variableBorrowRate)
        bVal = positionBorrowRate(b, b.variableBorrowRate)
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

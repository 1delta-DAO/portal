import type { PoolConfigGroup } from '../../../sdk/lending-helper/marketTypes'
import type { PoolRole } from '../tabs/trading/types'

/**
 * Presentation constants and pure aggregations shared by the config-market
 * view and its extracted table/cell components.
 *
 * These live apart from the components so `ConfigMarketView`, its detail table
 * and its cells can all reach them without importing each other — the circular
 * import that kept the whole thing in one 1,300-line file.
 */

/** Configs per page in the top-level table. */
export const CONFIG_PAGE_SIZE = 8

/** Rows per page inside an expanded config's detail table. */
export const DETAIL_PAGE_SIZE = 10

/** Thin left-rail accent that signals a Loop role on the row. No background
 *  tint — that lane is reserved for hover / inspect-selected state, so role
 *  selection (rail + top-right chip) doesn't collide with side type or row
 *  selection state. */
export const ROLE_RAIL: Record<PoolRole, string> = {
  input: 'border-l-[3px] border-l-error',
  output: 'border-l-[3px] border-l-success',
  pay: 'border-l-[3px] border-l-warning',
}

export const ROLE_LABEL: Record<PoolRole, string> = {
  input: 'Loop In',
  output: 'Loop Out',
  pay: 'Pay',
}

export const ROLE_CHIP_CLASS: Record<PoolRole, string> = {
  input: 'bg-error/15 text-error',
  output: 'bg-success/15 text-success',
  pay: 'bg-warning/15 text-warning',
}

/** "Disabled" is the API's term for "no e-mode" — confusing in the UI, where
 *  it reads as if the config itself were turned off. Reword for display. */
export function displayConfigLabel(label: string | undefined, configId: string): string {
  const raw = (label || `Config ${configId}`).trim()
  if (raw.toLowerCase() === 'disabled') return 'Standard (no e-mode)'
  return raw
}

/** Total borrow liquidity USD across borrowables (deduplicated by marketUid). */
export function configBorrowLiquidity(g: PoolConfigGroup): number {
  const seen = new Set<string>()
  let total = 0
  for (const item of g.borrowables ?? []) {
    if (!seen.has(item.marketUid)) {
      seen.add(item.marketUid)
      total += item.totalLiquidityUsd ?? item.totalDepositsUsd - item.totalDebtUsd
    }
  }
  return total
}

/** Aggregate stats used for table columns + summary chips. */
export interface ConfigStats {
  collCount: number
  borCount: number
  totalCollUsd: number
  maxLtv: number
  bestDepositApr: number
  borrowLiquidity: number
}

export function computeConfigStats(
  g: PoolConfigGroup,
  /**
   * Map a collateral row's own deposit rate to the POSITION's, when the caller
   * can (it needs the Fluid descriptor, which `/pools/by-config` does not
   * carry — see `AssetCell`'s `row` prop).
   *
   * "Best APR" is a MAX OVER LEGS, and on an LP-backed side each leg reports
   * its own rate while the position earns the weighted blend — so the max is
   * the single most over-stated number this view can print. On the live
   * wstETH+ETH vault it read 2.09 % against a position rate of 1.70 %. With the
   * resolver every leg maps to the same basket figure, so the max becomes it.
   */
  positionRate?: (marketUid: string, legRate: number) => number,
  /**
   * Same bridge for the INTRINSIC leg. `intrinsicYield` is a property of the
   * token, so on an LP side it is weighted across the legs too — otherwise the
   * max picks whichever leg happens to carry the staking yield and claims the
   * whole position earns it.
   */
  intrinsicRate?: (marketUid: string, legIntrinsic: number) => number
): ConfigStats {
  let totalCollUsd = 0
  let maxLtv = 0
  let bestDepositApr = 0
  for (const c of g.collaterals ?? []) {
    totalCollUsd += c.totalDepositsUsd || 0
    maxLtv = Math.max(maxLtv, c.borrowCollateralFactor || 0)
    const base = c.depositRate || 0
    const iy = c.intrinsicYield ?? 0
    const apr =
      (positionRate ? positionRate(c.marketUid, base) : base) +
      (intrinsicRate ? intrinsicRate(c.marketUid, iy) : iy)
    bestDepositApr = Math.max(bestDepositApr, apr)
  }
  return {
    collCount: g.collaterals?.length ?? 0,
    borCount: g.borrowables?.length ?? 0,
    totalCollUsd,
    maxLtv,
    bestDepositApr,
    borrowLiquidity: configBorrowLiquidity(g),
  }
}

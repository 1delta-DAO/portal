import type { PoolEntry } from '../../../../sdk/lending-helper/poolTypes'
import type { PoolWithMetrics, SortKey } from './helpers'

/**
 * The Earn tab's client-side filter + sort pipeline.
 *
 * Pure, and separate from the view, for two reasons: it is the tab's actual
 * behaviour (which markets a user does and does not see), and it carries a
 * pile of non-obvious exemptions that are invisible from the rendered output
 * when they break — a market that should be listed simply is not there. Pure
 * input → output makes those testable.
 *
 * Note this runs over the WHOLE pool universe. `MarketsView` deliberately
 * fetches every market client-side rather than pushing these filters to the
 * API — see the long note on `serverFilters` there for why the semantics don't
 * line up. That is also why the caller debounces the search box.
 */

/** Every filter value the pipeline reads. Strings are raw input-box values. */
export interface PoolFilterCriteria {
  /** Lender key, or `'all'`. */
  selectedLender: string
  /** Free-text search. Debounce before passing it in. */
  search: string
  /** Asset symbol / group / address substring. */
  assetFilter: string
  /**
   * Parent-driven CSV of underlying addresses ("Your Assets" row clicks, the
   * "owned only" toggle).
   */
  externalAssetFilter?: string
  /**
   * Why `externalAssetFilter` is set, which decides whether the numeric
   * value-floors below still apply:
   *
   *   - `'explicit'` (default): the user named ONE asset by clicking its row,
   *     so a default TVL/APR floor must not hide the markets holding it. The
   *     floors are SKIPPED.
   *   - `'owned'`: the "filter markets to owned assets" toggle, which is a
   *     broad narrowing across the whole wallet rather than a request for a
   *     specific market. The floors STILL APPLY — otherwise flipping the
   *     toggle silently disables every other filter in the toolbar.
   *
   * The risk ceiling is enforced either way.
   */
  externalAssetFilterSource?: 'explicit' | 'owned'
  /** App-wide risk ceiling, already clamped. Always enforced. */
  effectiveMaxRisk: number

  minUtilPct: string
  maxUtilPct: string
  minAprPct: string
  maxAprPct: string
  minDepositsUsd: string
  maxDepositsUsd: string
  minDepositsNative: string
  maxDepositsNative: string
  minDebtNative: string
  maxDebtNative: string
  minLiquidityNative: string
  maxLiquidityNative: string
  minDebtUsd: string
  maxDebtUsd: string
  minLiquidityUsd: string
  maxLiquidityUsd: string

  sortKey: SortKey
  sortDir: 'asc' | 'desc'
}

/**
 * Some lenders (e.g. Fluid) don't populate the top-level `underlyingAddress`
 * on pool entries — the canonical asset address only lives under
 * `underlyingInfo.asset.address`. Use this so address-based matches (search
 * box, asset filter, parent-driven whitelist) treat both as equivalent and
 * stop accidentally hiding those pools.
 */
function poolUnderlying(p: PoolEntry): string {
  return (p.underlyingAddress || p.underlyingInfo?.asset?.address || '').toLowerCase()
}

/**
 * Deposit-only markets (e.g. Fluid "Collateral X" pools) have
 * `borrowingEnabled: false`, which means 0% utilization and ~0% deposit APR
 * are inherent — not a signal the market is junk.
 */
function isDepositOnly(p: PoolEntry): boolean {
  return p.flags?.borrowingEnabled === false && p.flags?.depositsEnabled !== false
}

/**
 * Whether the row has a deposit side AT ALL.
 *
 * This table is the Earn tab's deposit surface — every row opens a
 * Deposit/Withdraw panel — so a market the protocol does not take deposits on
 * has no business being listed, however good its APR looks. The flag is a
 * per-market fact from the backend, not a heuristic.
 *
 * It is not only a cosmetic filter. The Gearbox rows are the case that forced
 * it: each `GEARBOX_V3_<creditManager>` market is the BORROW side of a shared
 * passive pool, so seven credit managers republished the same WETH pool at the
 * same 2.20 % — one pool rendered as seven earn rows — while a deposit on any
 * of them is not a thing the credit manager does. That pool IS depositable, as
 * exactly one row, under Earn → Vaults (provider `gearbox`), which is where it
 * belongs. Dolomite's closing markets are the other current case.
 */
export function hasDepositSide(p: PoolEntry): boolean {
  return p.flags?.depositsEnabled !== false
}

/**
 * Fixed-rate earn markets (Midnight order book, Term repo listings, Exactly
 * fixed pools) have structurally low/zero pool utilization — the yield is a
 * book or a fixed pool, not a variable pool rate.
 */
const FIXED_TERM_PREFIXES = ['MORPHO_MIDNIGHT', 'TERM_FINANCE', 'EXACTLY']

/**
 * Whether a pool is exempt from the utilization / APR floors.
 *
 * Those floors are written for two-sided variable lending markets. Applying
 * them to deposit-only or fixed-term markets hides perfectly good rows at the
 * default thresholds — including, for fixed-term, rows the user just opted
 * into via the Fixed-rate switch.
 */
function isFloorExempt(p: PoolEntry): boolean {
  return isDepositOnly(p) || FIXED_TERM_PREFIXES.some((prefix) => !!p.lenderKey?.startsWith(prefix))
}

/** Apply a numeric min/max pair from raw input strings. Blank or 0 means "off". */
function applyMinMax(
  rows: PoolWithMetrics[],
  minStr: string,
  maxStr: string,
  getValue: (p: PoolEntry) => number
): PoolWithMetrics[] {
  const min = parseFloat(minStr)
  const max = parseFloat(maxStr)
  const hasMin = !Number.isNaN(min) && min > 0
  const hasMax = !Number.isNaN(max) && max > 0
  if (!hasMin && !hasMax) return rows
  return rows.filter(({ pool: p }) => {
    const v = getValue(p)
    if (hasMin && v < min) return false
    if (hasMax && v > max) return false
    return true
  })
}

/** The value a row sorts on, for the given key. */
function sortValue({ pool, metrics }: PoolWithMetrics, key: SortKey): number {
  switch (key) {
    case 'apr':
      return metrics.apr
    case 'borrowRate':
      return metrics.borrowApr
    case 'intrinsicYield':
      return metrics.intrinsicYield
    case 'utilization':
      return metrics.utilization
    case 'totalDepositsUSD':
      return parseFloat(pool.totalDepositsUsd) || 0
    case 'totalDebtUSD':
      return parseFloat(pool.totalDebtUsd) || 0
    case 'totalLiquidityUSD':
      return parseFloat(pool.totalLiquidityUsd) || 0
    case 'totalDeposits':
      return parseFloat(pool.totalDeposits) || 0
    case 'totalDebt':
      return parseFloat(pool.totalDebt) || 0
    case 'totalLiquidity':
      return parseFloat(pool.totalLiquidity) || 0
    case 'riskScore':
      return pool.risk?.score ?? 0
    default:
      return 0
  }
}

export function filterAndSortPools(
  rows: PoolWithMetrics[],
  c: PoolFilterCriteria
): PoolWithMetrics[] {
  // Rows with no deposit side are dropped before anything else — no filter
  // combination, not even an explicit single-asset row click, should surface a
  // market whose Deposit panel cannot build a transaction.
  let result = rows.filter(({ pool: p }) => hasDepositSide(p))

  if (c.selectedLender !== 'all') {
    result = result.filter(({ pool: p }) => p.lenderKey === c.selectedLender)
  }

  if (c.search.trim()) {
    const q = c.search.toLowerCase()
    result = result.filter(
      ({ pool: p }) =>
        poolUnderlying(p).includes(q) ||
        (p.lenderKey ?? '').toLowerCase().includes(q) ||
        (p.lenderInfo?.name ?? '').toLowerCase().includes(q) ||
        (p.underlyingInfo?.asset?.assetGroup ?? '').toLowerCase().includes(q) ||
        (p.underlyingInfo?.asset?.symbol ?? '').toLowerCase().includes(q) ||
        (p.name ?? '').toLowerCase().includes(q)
    )
  }

  if (c.assetFilter.trim()) {
    const q = c.assetFilter.toLowerCase()
    result = result.filter(
      ({ pool: p }) =>
        (p.underlyingInfo?.asset?.assetGroup ?? '').toLowerCase().includes(q) ||
        (p.underlyingInfo?.asset?.symbol ?? '').toLowerCase().includes(q) ||
        poolUnderlying(p).includes(q)
    )
  }

  const hasExternalAssetFilter = !!c.externalAssetFilter?.trim()
  if (hasExternalAssetFilter) {
    const addrs = c.externalAssetFilter!.toLowerCase().split(',').filter(Boolean)
    if (addrs.length > 0) {
      const addrSet = new Set(addrs)
      result = result.filter(({ pool: p }) => addrSet.has(poolUnderlying(p)))
    }
  }

  // Risk score is always enforced (safety floor) — the effective max already
  // folds in the app-wide ceiling, so an override can only ever narrow it.
  result = result.filter(({ pool: p }) => (p.risk?.score ?? 0) <= c.effectiveMaxRisk)

  // The remaining filters are value-floors meant to trim the universe of pools
  // when browsing freely. Skip them only when the user narrowed to a specific
  // asset by name (row click), so that every market holding it stays visible.
  // The "owned assets" toggle does NOT skip them — it is a broad narrowing,
  // and dropping the floors there would make the toolbar's other filters look
  // broken the moment it is switched on.
  const skipValueFloors =
    hasExternalAssetFilter && (c.externalAssetFilterSource ?? 'explicit') === 'explicit'
  if (!skipValueFloors) {
    const minU = parseFloat(c.minUtilPct)
    const maxU = parseFloat(c.maxUtilPct)
    if (!Number.isNaN(minU) || !Number.isNaN(maxU)) {
      result = result.filter(({ pool: p, metrics }) => {
        if (isFloorExempt(p)) return true
        const u = metrics.utilization * 100
        if (!Number.isNaN(minU) && u < minU) return false
        if (!Number.isNaN(maxU) && u > maxU) return false
        return true
      })
    }

    const minApr = parseFloat(c.minAprPct)
    const maxApr = parseFloat(c.maxAprPct)
    if (!Number.isNaN(minApr) || !Number.isNaN(maxApr)) {
      result = result.filter(({ pool: p, metrics }) => {
        if (isFloorExempt(p)) return true
        if (!Number.isNaN(minApr) && metrics.apr < minApr) return false
        if (!Number.isNaN(maxApr) && metrics.apr > maxApr) return false
        return true
      })
    }

    result = applyMinMax(
      result,
      c.minDepositsUsd,
      c.maxDepositsUsd,
      (p) => parseFloat(p.totalDepositsUsd) || 0
    )
    result = applyMinMax(
      result,
      c.minDepositsNative,
      c.maxDepositsNative,
      (p) => parseFloat(p.totalDeposits) || 0
    )
    result = applyMinMax(
      result,
      c.minDebtNative,
      c.maxDebtNative,
      (p) => parseFloat(p.totalDebt) || 0
    )
    result = applyMinMax(
      result,
      c.minLiquidityNative,
      c.maxLiquidityNative,
      (p) => parseFloat(p.totalLiquidity) || 0
    )
    result = applyMinMax(result, c.minDebtUsd, c.maxDebtUsd, (p) => parseFloat(p.totalDebtUsd) || 0)
    result = applyMinMax(
      result,
      c.minLiquidityUsd,
      c.maxLiquidityUsd,
      (p) => parseFloat(p.totalLiquidityUsd) || 0
    )
  }

  return [...result].sort((a, b) => {
    const aVal = sortValue(a, c.sortKey)
    const bVal = sortValue(b, c.sortKey)
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return c.sortDir === 'asc' ? cmp : -cmp
  })
}

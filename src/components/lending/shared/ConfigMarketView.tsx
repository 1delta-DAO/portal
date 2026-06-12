import React, { useMemo, useState } from 'react'
import type {
  PoolConfigGroup,
  ConfigMarketItem,
  PoolDataItem,
} from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import type { TableHighlight, PoolRole, PoolSide } from '../tabs/trading/types'
import { abbreviateUsd, abbreviateNumber, formatUsd, formatTokenAmount } from '../../../utils/format'
import { AssetPopover } from './AssetPopover'
import { RiskBadge } from './RiskBadge'
import { BrokeredAprCell } from './BrokeredAprCell'
import { useTablePagination } from '../../../hooks/useTablePagination'
import { TablePagination } from '../../common/TablePagination'
import { EmptyState } from '../../common/EmptyState'
import { Logo } from '../../common/Logo'

interface Props {
  configGroups: PoolConfigGroup[]
  allPools: PoolDataItem[]
  selectedMarketUid?: string
  /** Called when a row is clicked. `side` is the row's side
   *  (`collateral` or `borrowable`) so multi-leg actions can route the click
   *  to the matching slot. Single-side consumers (lending tab) can ignore it. */
  onPoolSelect: (pool: PoolDataItem, side: PoolSide) => void
  userPositions: Map<string, UserPositionEntry>
  highlights?: TableHighlight[]
  isLoading?: boolean
  /** Controlled config selection (optional — uses internal state if not provided). */
  selectedConfigId?: string | null
  onConfigChange?: (configId: string) => void
  /** The user's active e-mode category string — matching configs are visually emphasized. */
  userActiveCategory?: string | null
}

const PAGE_SIZE = 8

/** Thin left-rail accent that signals a Loop role on the row. No background
 *  tint — that lane is reserved for hover / inspect-selected state, so role
 *  selection (rail + trailing chip) doesn't collide with side type or row
 *  selection state. */
const ROLE_RAIL: Record<PoolRole, string> = {
  input: 'border-l-[3px] border-l-error',
  output: 'border-l-[3px] border-l-success',
  pay: 'border-l-[3px] border-l-warning',
}

const ROLE_LABEL: Record<PoolRole, string> = {
  input: 'Loop In',
  output: 'Loop Out',
  pay: 'Pay',
}

const ROLE_CHIP_CLASS: Record<PoolRole, string> = {
  input: 'bg-error/15 text-error',
  output: 'bg-success/15 text-success',
  pay: 'bg-warning/15 text-warning',
}

/** "Disabled" is the API's term for "no e-mode" — confusing in the UI, where
 *  it reads as if the config itself were turned off. Reword for display. */
function displayConfigLabel(label: string | undefined, configId: string): string {
  const raw = (label || `Config ${configId}`).trim()
  if (raw.toLowerCase() === 'disabled') return 'Standard (no e-mode)'
  return raw
}

/** Total borrow liquidity USD across borrowables (deduplicated by marketUid). */
function configBorrowLiquidity(g: PoolConfigGroup): number {
  const seen = new Set<string>()
  let total = 0
  for (const item of g.borrowables ?? []) {
    if (!seen.has(item.marketUid)) {
      seen.add(item.marketUid)
      total += item.totalLiquidityUsd ?? (item.totalDepositsUsd - item.totalDebtUsd)
    }
  }
  return total
}

/** Aggregate stats used for table columns + summary chips. */
interface ConfigStats {
  collCount: number
  borCount: number
  totalCollUsd: number
  maxLtv: number
  bestDepositApr: number
  borrowLiquidity: number
}

function computeConfigStats(g: PoolConfigGroup): ConfigStats {
  let totalCollUsd = 0
  let maxLtv = 0
  let bestDepositApr = 0
  for (const c of g.collaterals ?? []) {
    totalCollUsd += c.totalDepositsUsd || 0
    maxLtv = Math.max(maxLtv, c.borrowCollateralFactor || 0)
    const apr = (c.depositRate || 0) + (c.intrinsicYield ?? 0)
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

export const ConfigMarketView: React.FC<Props> = ({
  configGroups,
  allPools,
  selectedMarketUid,
  onPoolSelect,
  userPositions,
  highlights,
  isLoading,
  selectedConfigId: controlledConfigId,
  onConfigChange,
  userActiveCategory,
}) => {
  const [internalConfigId, setInternalConfigId] = useState<string | null>(null)
  const [configFilter, setConfigFilter] = useState('')
  // Tracks whether the user explicitly cleared the selection (clicked the
  // active row to collapse). When true, the auto-select effect stops
  // re-asserting a default — so the collapsed state actually persists.
  // Reset on configGroups identity change so a lender switch gets a fresh
  // default selection.
  const [userCleared, setUserCleared] = useState(false)

  React.useEffect(() => {
    setUserCleared(false)
  }, [configGroups])

  // Use controlled or internal state
  const isControlled = controlledConfigId !== undefined
  const selectedConfigId = isControlled ? controlledConfigId : internalConfigId
  const setSelectedConfigId = (id: string | null) => {
    if (isControlled) {
      onConfigChange?.(id ?? '')
    } else {
      setInternalConfigId(id)
    }
  }
  const toggleConfig = (id: string) => {
    if (id === selectedConfigId) {
      setUserCleared(true)
      setSelectedConfigId(null)
    } else {
      setUserCleared(false)
      setSelectedConfigId(id)
    }
  }

  // Sort config groups: user's active e-mode first, then by total liquidity descending
  const sortedGroups = useMemo(() => {
    const q = configFilter.trim().toLowerCase()
    const filtered = q
      ? configGroups.filter((g) => {
          if (displayConfigLabel(g.label, g.configId).toLowerCase().includes(q)) return true
          const matchAssets = (items: ConfigMarketItem[] | null) =>
            items?.some(
              (i) =>
                i.underlyingInfo.asset.symbol.toLowerCase().includes(q) ||
                i.underlyingInfo.asset.name.toLowerCase().includes(q)
            )
          return matchAssets(g.collaterals) || matchAssets(g.borrowables)
        })
      : configGroups
    return [...filtered].sort((a, b) => {
      if (userActiveCategory != null) {
        const aIsActive = a.category === userActiveCategory
        const bIsActive = b.category === userActiveCategory
        if (aIsActive && !bIsActive) return -1
        if (bIsActive && !aIsActive) return 1
      }
      return configBorrowLiquidity(b) - configBorrowLiquidity(a)
    })
  }, [configGroups, userActiveCategory, configFilter])

  // Pagination — auto-resets on filter / group-count change
  const configPagination = useTablePagination(sortedGroups, PAGE_SIZE, [configFilter])
  const { pagedItems: pagedGroups } = configPagination

  // Auto-select first config — but only if the user hasn't explicitly cleared
  // the selection (so the inline detail can actually be collapsed and stay
  // collapsed). On lender switch, configGroups identity changes and
  // userCleared resets, so a fresh default is picked.
  React.useEffect(() => {
    if (userCleared) return
    if (sortedGroups.length > 0 && (!selectedConfigId || !sortedGroups.find((g) => g.configId === selectedConfigId))) {
      setSelectedConfigId(sortedGroups[0].configId)
    }
  }, [sortedGroups, selectedConfigId, userCleared])

  // Map marketUid → PoolDataItem for selection
  const poolMap = useMemo(() => {
    const map = new Map<string, PoolDataItem>()
    for (const p of allPools) map.set(p.marketUid, p)
    return map
  }, [allPools])

  // Highlight map for trading view, keyed by `${marketUid}|${side}` so the
  // role only lights up the row that actually corresponds to the action's
  // selection — without the side, the same asset's collateral and borrowable
  // rows would both inherit the highlight.
  const highlightMap = useMemo(() => {
    const map = new Map<string, PoolRole>()
    if (highlights) {
      for (const h of highlights) map.set(`${h.marketUid}|${h.side}`, h.role)
    }
    return map
  }, [highlights])

  const handleRowClick = (marketUid: string, side: PoolSide) => {
    const pool = poolMap.get(marketUid)
    if (pool) onPoolSelect(pool, side)
  }

  if (isLoading) {
    return (
      <div className="rounded-box border border-base-300 p-4 sm:p-6 flex justify-center">
        <span className="loading loading-spinner loading-md" />
      </div>
    )
  }

  if (configGroups.length === 0) {
    return (
      <div className="rounded-box border border-base-300 p-4 sm:p-6">
        <EmptyState title="No config data available for this lender." />
      </div>
    )
  }

  const COL_COUNT = 7

  return (
    <div className="rounded-box border border-base-300 overflow-hidden">
      {/* Filter */}
      {configGroups.length > 3 && (
        <div className="px-3 py-1.5 border-b border-base-300">
          <input
            type="text"
            placeholder="Filter configs by name or asset…"
            value={configFilter}
            onChange={(e) => setConfigFilter(e.target.value)}
            className="input input-xs input-bordered w-full max-w-sm bg-base-100"
          />
        </div>
      )}

      {sortedGroups.length === 0 ? (
        <EmptyState size="sm" title="No matching configs" />
      ) : (
        <>
          {/* Desktop table — selected row inline-expands with detail panel */}
          <div className="hidden md:block overflow-x-auto">
            <table className="table table-sm w-full">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
                <tr>
                  <th className="w-[20%]">Config</th>
                  <th className="w-[16%]">Collaterals</th>
                  <th className="w-[16%]">Borrowables</th>
                  <th className="w-[8%]" title="Highest LTV across this config's collateral assets">
                    Max LTV
                  </th>
                  <th className="w-[10%]" title="Best deposit APR across this config's collateral assets (incl. intrinsic yield)">
                    Best APR
                  </th>
                  <th className="w-[14%]" title="Total available borrow liquidity across borrowables">
                    Borrow Liq.
                  </th>
                  <th className="w-[10%]">Risk</th>
                </tr>
              </thead>
              <tbody>
                {pagedGroups.map((g) => {
                  const isActive = g.configId === selectedConfigId
                  const isUserMode = userActiveCategory != null && g.category === userActiveCategory
                  const stats = computeConfigStats(g)
                  const labelText = displayConfigLabel(g.label, g.configId)

                  return (
                    <React.Fragment key={g.configId}>
                      <tr
                        className={`cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-primary/10'
                            : isUserMode
                              ? 'bg-success/5 hover:bg-success/10'
                              : 'hover:bg-base-200'
                        }`}
                        onClick={() => toggleConfig(g.configId)}
                      >
                        <td>
                          <div className="flex items-center gap-2 min-w-0">
                            <ExpandChevron expanded={isActive} />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-sm truncate" title={labelText}>
                                {labelText}
                              </span>
                              {isUserMode && (
                                <span className="text-[10px] font-medium text-success/80">
                                  your active mode
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <AssetPreview items={g.collaterals} count={stats.collCount} />
                        </td>
                        <td>
                          <AssetPreview items={g.borrowables} count={stats.borCount} />
                        </td>
                        <td>
                          {stats.maxLtv > 0 ? (
                            <span className="text-xs font-medium tabular-nums">
                              {(stats.maxLtv * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-xs text-base-content/40">—</span>
                          )}
                        </td>
                        <td>
                          {stats.bestDepositApr > 0 ? (
                            <span className="text-xs font-medium text-success tabular-nums">
                              {stats.bestDepositApr.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-xs text-base-content/40">—</span>
                          )}
                        </td>
                        <td>
                          <span
                            className="text-xs tabular-nums"
                            title={`$${formatUsd(stats.borrowLiquidity)}`}
                          >
                            {abbreviateUsd(stats.borrowLiquidity)}
                          </span>
                        </td>
                        <td>
                          {g.configRiskLabel ? (
                            <RiskBadge label={g.configRiskLabel} breakdown={g.configRiskBreakdown ?? []} />
                          ) : (
                            <span className="text-xs text-base-content/40">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Inline-expanded detail row — no shared background tint
                          here, otherwise every inner row would look hovered
                          at once and the per-row `hover:bg-base-200` becomes
                          indistinguishable. */}
                      {isActive && (
                        <tr>
                          <td colSpan={COL_COUNT} className="p-0">
                            <CombinedDetailTable
                              group={g}
                              selectedMarketUid={selectedMarketUid}
                              userPositions={userPositions}
                              highlightMap={highlightMap}
                              onRowClick={handleRowClick}
                              poolMap={poolMap}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-base-300">
            {pagedGroups.map((g) => {
              const isActive = g.configId === selectedConfigId
              const isUserMode = userActiveCategory != null && g.category === userActiveCategory
              const stats = computeConfigStats(g)
              const labelText = displayConfigLabel(g.label, g.configId)

              return (
                <div key={`m-${g.configId}`}>
                  <div
                    className={`p-3 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-primary/10'
                        : isUserMode
                          ? 'bg-success/5'
                          : 'active:bg-base-200'
                    }`}
                    onClick={() => toggleConfig(g.configId)}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ExpandChevron expanded={isActive} />
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-sm truncate">{labelText}</span>
                          {isUserMode && (
                            <span className="text-[10px] font-medium text-success/80">
                              your active mode
                            </span>
                          )}
                        </div>
                      </div>
                      {g.configRiskLabel && (
                        <RiskBadge
                          label={g.configRiskLabel}
                          breakdown={g.configRiskBreakdown ?? []}
                          size="sm"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex items-baseline justify-between gap-2 min-w-0">
                        <span className="text-base-content/50 shrink-0">Max LTV</span>
                        <span className="font-medium tabular-nums">
                          {stats.maxLtv > 0 ? `${(stats.maxLtv * 100).toFixed(0)}%` : '—'}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 min-w-0">
                        <span className="text-base-content/50 shrink-0">Best APR</span>
                        <span className="font-medium text-success tabular-nums">
                          {stats.bestDepositApr > 0 ? `${stats.bestDepositApr.toFixed(2)}%` : '—'}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 min-w-0">
                        <span className="text-base-content/50 shrink-0">Borrow Liq.</span>
                        <span className="font-medium tabular-nums">
                          {abbreviateUsd(stats.borrowLiquidity)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 min-w-0">
                        <span className="text-base-content/50 shrink-0">Assets</span>
                        <span className="font-medium tabular-nums">
                          {stats.collCount}c · {stats.borCount}b
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-base-content/60">
                      <div className="flex items-center gap-1">
                        <span className="text-success/70">Coll:</span>
                        <AssetPreview items={g.collaterals} count={stats.collCount} max={4} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-error/70">Bor:</span>
                        <AssetPreview items={g.borrowables} count={stats.borCount} max={4} />
                      </div>
                    </div>
                  </div>

                  {/* Inline detail */}
                  {isActive && (
                    <div className="bg-primary/5 border-t border-base-300">
                      <CombinedDetailTable
                        group={g}
                        selectedMarketUid={selectedMarketUid}
                        userPositions={userPositions}
                        highlightMap={highlightMap}
                        onRowClick={handleRowClick}
                        poolMap={poolMap}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <TablePagination pagination={configPagination} totalItems={sortedGroups.length} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AssetPreview — count + 3 logos + listing tooltip
// ---------------------------------------------------------------------------

const AssetPreview: React.FC<{
  items: ConfigMarketItem[] | null
  count: number
  max?: number
}> = ({ items, count, max = 3 }) => {
  if (!items || items.length === 0) {
    return <span className="text-xs text-base-content/40">—</span>
  }

  const visible = items.slice(0, max)
  const overflow = count - visible.length
  const allSymbols = items.map((i) => i.underlyingInfo.asset.symbol).join(', ')

  return (
    <div className="flex items-center gap-1.5 min-w-0" title={allSymbols}>
      <span className="text-xs font-medium tabular-nums text-base-content/70">{count}</span>
      <div className="flex -space-x-1.5 shrink-0">
        {visible.map((item) => (
          <Logo
            key={item.marketUid}
            src={item.underlyingInfo.asset.logoURI}
            alt={item.underlyingInfo.asset.symbol}
            fallbackText={item.underlyingInfo.asset.symbol}
            className="rounded-full object-contain w-5 h-5 border-2 border-base-100 bg-base-100 token-logo"
          />
        ))}
      </div>
      {overflow > 0 && (
        <span className="text-[10px] text-base-content/50 shrink-0">+{overflow}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CombinedDetailTable — single table with Side column, sortable
// ---------------------------------------------------------------------------

type DetailSide = 'all' | 'collateral' | 'borrowable'
type DetailSortKey = 'side' | 'liquidity' | 'apr' | 'ltv'

const DETAIL_PAGE_SIZE = 10

interface CombinedDetailTableProps {
  group: PoolConfigGroup
  selectedMarketUid?: string
  userPositions: Map<string, UserPositionEntry>
  highlightMap: Map<string, PoolRole>
  onRowClick: (marketUid: string, side: PoolSide) => void
  poolMap: Map<string, PoolDataItem>
}

interface DetailRow {
  side: 'collateral' | 'borrowable'
  item: ConfigMarketItem
}

const CombinedDetailTable: React.FC<CombinedDetailTableProps> = ({
  group,
  selectedMarketUid,
  userPositions,
  highlightMap,
  onRowClick,
  poolMap,
}) => {
  const [side, setSide] = useState<DetailSide>('all')
  const [sortKey, setSortKey] = useState<DetailSortKey>('liquidity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filter, setFilter] = useState('')

  const allRows = useMemo<DetailRow[]>(() => {
    const out: DetailRow[] = []
    for (const c of group.collaterals ?? []) out.push({ side: 'collateral', item: c })
    for (const b of group.borrowables ?? []) out.push({ side: 'borrowable', item: b })
    return out
  }, [group])

  const filteredSorted = useMemo(() => {
    let rows = allRows
    if (side !== 'all') rows = rows.filter((r) => r.side === side)

    const q = filter.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) => {
        const a = r.item.underlyingInfo.asset
        return a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
      })
    }

    const valueFor = (r: DetailRow): number => {
      const it = r.item
      const iy = it.intrinsicYield ?? 0
      switch (sortKey) {
        case 'side':
          // Collateral < Borrowable so 'asc' puts collateral first
          return r.side === 'collateral' ? 0 : 1
        case 'liquidity':
          return r.side === 'borrowable'
            ? it.totalLiquidityUsd ?? it.totalDepositsUsd - it.totalDebtUsd
            : it.totalDepositsUsd
        case 'apr':
          return r.side === 'borrowable'
            ? it.variableBorrowRate + iy
            : it.depositRate + iy
        case 'ltv':
          return it.borrowCollateralFactor || 0
      }
    }

    return [...rows].sort((a, b) => {
      const av = valueFor(a)
      const bv = valueFor(b)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [allRows, side, filter, sortKey, sortDir])

  // Pin rows that carry a Loop role to the top — without this, a highlighted
  // row (e.g. the debt-repay output) can sort below the page boundary and be
  // invisible until the user paginates. The pin is stable so the within-pinned
  // and within-unpinned ordering still respects the user's chosen sort.
  const pinnedSorted = useMemo(() => {
    if (highlightMap.size === 0) return filteredSorted
    const pinned: DetailRow[] = []
    const rest: DetailRow[] = []
    for (const r of filteredSorted) {
      if (highlightMap.has(`${r.item.marketUid}|${r.side}`)) pinned.push(r)
      else rest.push(r)
    }
    return [...pinned, ...rest]
  }, [filteredSorted, highlightMap])

  const detailPagination = useTablePagination(pinnedSorted, DETAIL_PAGE_SIZE, [
    side,
    filter,
    sortKey,
    sortDir,
    highlightMap,
  ])
  const { pagedItems: pagedRows } = detailPagination

  const toggleSort = (key: DetailSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortIndicator = (key: DetailSortKey) =>
    sortKey === key ? <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  const collCount = group.collaterals?.length ?? 0
  const borCount = group.borrowables?.length ?? 0

  return (
    <div className="border-t border-base-300">
      {/* Toolbar: side filter + search */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-base-300 bg-base-200/30">
        <div role="tablist" className="tabs tabs-boxed tabs-xs bg-base-100">
          <button
            type="button"
            role="tab"
            className={`tab ${side === 'all' ? 'tab-active' : ''}`}
            onClick={() => setSide('all')}
          >
            All <span className="text-base-content/50 ml-1">{collCount + borCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${side === 'collateral' ? 'tab-active' : ''}`}
            onClick={() => setSide('collateral')}
          >
            Collateral <span className="text-base-content/50 ml-1">{collCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${side === 'borrowable' ? 'tab-active' : ''}`}
            onClick={() => setSide('borrowable')}
          >
            Borrowable <span className="text-base-content/50 ml-1">{borCount}</span>
          </button>
        </div>
        <input
          type="text"
          placeholder="Filter assets…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input input-xs input-bordered ml-auto w-full sm:w-56 bg-base-100"
        />
      </div>

      {filteredSorted.length === 0 ? (
        <EmptyState size="sm" title="No matches" />
      ) : (
        <>
          {/* Desktop combined table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="table table-sm w-full">
              <thead className="[&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
                <tr>
                  <th
                    className="w-[7%] cursor-pointer select-none"
                    onClick={() => toggleSort('side')}
                  >
                    Side{sortIndicator('side')}
                  </th>
                  <th className="w-[22%]">Asset</th>
                  <th
                    className="w-[9%] cursor-pointer select-none"
                    onClick={() => toggleSort('apr')}
                  >
                    APR{sortIndicator('apr')}
                  </th>
                  <th
                    className="w-[7%] cursor-pointer select-none"
                    onClick={() => toggleSort('ltv')}
                    title="Loan-to-value (collateral only)"
                  >
                    LTV{sortIndicator('ltv')}
                  </th>
                  <th className="w-[11%]">Deposits</th>
                  <th
                    className="w-[11%] cursor-pointer select-none"
                    onClick={() => toggleSort('liquidity')}
                    title="Borrow liquidity (borrowable) / Deposits (collateral)"
                  >
                    Liquidity{sortIndicator('liquidity')}
                  </th>
                  <th className="w-[11%]">Debt</th>
                  <th className="w-[12%]" title="Loop role: this row's slot in the active loop action">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(({ side: rowSide, item }) => {
                  const isSelected = selectedMarketUid === item.marketUid
                  const role = highlightMap.get(`${item.marketUid}|${rowSide}`)
                  const userPos = userPositions.get(item.marketUid)
                  const hasPosition =
                    userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
                  const iy = item.intrinsicYield ?? 0
                  const pool = poolMap.get(item.marketUid)
                  const sym = item.underlyingInfo.asset.symbol
                  const liqUsd = item.totalLiquidityUsd ?? item.totalDepositsUsd - item.totalDebtUsd
                  const liqToken = item.totalLiquidity ?? pool?.totalLiquidity
                  const isBrokered =
                    !!pool && (pool.variableBorrowDisabled === true || (pool.terms?.length ?? 0) > 0)

                  return (
                    <tr
                      key={`${rowSide}-${item.marketUid}`}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-base-200'
                      } ${role ? ROLE_RAIL[role] : ''}`}
                      onClick={() => onRowClick(item.marketUid, rowSide)}
                    >
                      <td>
                        <SideBadge side={rowSide} />
                      </td>
                      <td className="max-w-36">
                        <AssetCell
                          item={item}
                          hasPosition={!!hasPosition}
                          entityName={pool?.name}
                        />
                      </td>
                      <td>
                        {rowSide === 'collateral' ? (
                          <AprCell rate={item.depositRate} iy={iy} color="success" />
                        ) : isBrokered ? (
                          <BrokeredAprCell terms={pool?.terms} />
                        ) : (
                          <AprCell rate={item.variableBorrowRate} iy={iy} color="warning" />
                        )}
                      </td>
                      <td>
                        {rowSide === 'collateral' ? (
                          <span className="text-xs font-medium tabular-nums">
                            {(item.borrowCollateralFactor * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-base-content/30">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span
                            className="text-xs tabular-nums"
                            title={`$${formatUsd(item.totalDepositsUsd)}`}
                          >
                            {abbreviateUsd(item.totalDepositsUsd)}
                          </span>
                          {pool && (
                            <span
                              className="text-[10px] text-base-content/50 tabular-nums"
                              title={formatTokenAmount(pool.totalDeposits)}
                            >
                              {abbreviateNumber(pool.totalDeposits)} {sym}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span
                            className="text-xs tabular-nums"
                            title={`$${formatUsd(liqUsd)}`}
                          >
                            {abbreviateUsd(liqUsd)}
                          </span>
                          {liqToken != null && (
                            <span
                              className="text-[10px] text-base-content/50 tabular-nums"
                              title={formatTokenAmount(liqToken)}
                            >
                              {abbreviateNumber(liqToken)} {sym}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col">
                          <span
                            className="text-xs tabular-nums"
                            title={`$${formatUsd(item.totalDebtUsd)}`}
                          >
                            {abbreviateUsd(item.totalDebtUsd)}
                          </span>
                          {pool && (
                            <span
                              className="text-[10px] text-base-content/50 tabular-nums"
                              title={formatTokenAmount(pool.totalDebt)}
                            >
                              {abbreviateNumber(pool.totalDebt)} {sym}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <RoleChip role={role} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-base-300">
            {pagedRows.map(({ side: rowSide, item }) => {
              const isSelected = selectedMarketUid === item.marketUid
              const role = highlightMap.get(`${item.marketUid}|${rowSide}`)
              const userPos = userPositions.get(item.marketUid)
              const hasPosition =
                userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
              const iy = item.intrinsicYield ?? 0
              const pool = poolMap.get(item.marketUid)
              const sym = item.underlyingInfo.asset.symbol
              const liqUsd = item.totalLiquidityUsd ?? item.totalDepositsUsd - item.totalDebtUsd
              const liqToken = item.totalLiquidity ?? pool?.totalLiquidity
              const isBrokered =
                !!pool && (pool.variableBorrowDisabled === true || (pool.terms?.length ?? 0) > 0)

              return (
                <div
                  key={`m-${rowSide}-${item.marketUid}`}
                  className={`p-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10' : 'active:bg-base-200'
                  } ${role ? ROLE_RAIL[role] : ''}`}
                  onClick={() => onRowClick(item.marketUid, rowSide)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <SideBadge side={rowSide} />
                      <AssetCell
                        item={item}
                        hasPosition={!!hasPosition}
                        entityName={pool?.name}
                      />
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      {role && <RoleChip role={role} />}
                      {rowSide === 'collateral' ? (
                        <>
                          <AprCell rate={item.depositRate} iy={iy} color="success" />
                          <span className="text-[10px] text-base-content/50 block">
                            Deposit APR
                          </span>
                        </>
                      ) : isBrokered ? (
                        <>
                          <BrokeredAprCell terms={pool?.terms} />
                          <span className="text-[10px] text-base-content/50 block">
                            Fixed-term
                          </span>
                        </>
                      ) : (
                        <>
                          <AprCell rate={item.variableBorrowRate} iy={iy} color="warning" />
                          <span className="text-[10px] text-base-content/50 block">
                            Borrow APR
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                    {rowSide === 'collateral' ? (
                      <div className="flex justify-between">
                        <span className="text-base-content/50">LTV</span>
                        <span className="font-medium tabular-nums">
                          {(item.borrowCollateralFactor * 100).toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span className="text-base-content/50">Liquidity</span>
                        <span
                          className="font-medium tabular-nums truncate"
                          title={
                            liqToken != null ? `${formatTokenAmount(liqToken)} ${sym}` : undefined
                          }
                        >
                          {abbreviateUsd(liqUsd)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-base-content/50">
                        {rowSide === 'collateral' ? 'Deposits' : 'Debt'}
                      </span>
                      <span
                        className="font-medium tabular-nums truncate"
                        title={
                          pool
                            ? `${formatTokenAmount(
                                rowSide === 'collateral' ? pool.totalDeposits : pool.totalDebt
                              )} ${sym}`
                            : undefined
                        }
                      >
                        {abbreviateUsd(
                          rowSide === 'collateral' ? item.totalDepositsUsd : item.totalDebtUsd
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <TablePagination
            pagination={detailPagination}
            totalItems={filteredSorted.length}
            itemNoun="markets"
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared cell components
// ---------------------------------------------------------------------------

/**
 * Down-pointing chevron rotated -90° when collapsed (right-pointing).
 * Matches the SVG used in token-selection/Dropdown for visual consistency
 * across the app's expand/collapse affordances.
 */
const ExpandChevron: React.FC<{ expanded: boolean }> = ({ expanded }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={`w-3.5 h-3.5 shrink-0 text-base-content/40 transition-transform ${
      expanded ? '' : '-rotate-90'
    }`}
    aria-hidden
  >
    <path
      fillRule="evenodd"
      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
      clipRule="evenodd"
    />
  </svg>
)

/**
 * Trailing role chip — pairs with the colored left rail to signal which
 * Loop slot this row is currently filling. Renders an empty placeholder
 * when no role is assigned so the column doesn't visually collapse.
 */
const RoleChip: React.FC<{ role: PoolRole | undefined }> = ({ role }) => {
  if (!role) {
    return <span className="text-[10px] text-base-content/30">—</span>
  }
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${ROLE_CHIP_CLASS[role]}`}
      title={`Selected as ${ROLE_LABEL[role]} in the active loop action`}
    >
      {ROLE_LABEL[role]}
    </span>
  )
}

const SideBadge: React.FC<{ side: 'collateral' | 'borrowable' }> = ({ side }) => {
  const isColl = side === 'collateral'
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
        isColl ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
      }`}
    >
      {isColl ? 'Coll' : 'Bor'}
    </span>
  )
}

const AssetCell: React.FC<{ item: ConfigMarketItem; hasPosition: boolean; entityName?: string }> = ({
  item,
  hasPosition,
  entityName,
}) => {
  const asset = item.underlyingInfo.asset
  const iy = item.intrinsicYield ?? 0
  return (
    <AssetPopover
      address={asset.address}
      name={asset.name}
      symbol={asset.symbol}
      logoURI={asset.logoURI}
      positionDot={hasPosition}
      marketUid={item.marketUid}
      marketName={entityName ?? `${asset.symbol} (${asset.name})`}
      currentDepositRate={item.depositRate + iy}
      currentBorrowRate={item.variableBorrowRate + iy}
      priceUsd={item.underlyingInfo.prices?.priceUsd}
      oraclePriceUsd={item.underlyingInfo.oraclePrice?.oraclePriceUsd}
      chainId={asset.chainId}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-medium text-sm truncate" title={asset.symbol}>
          {asset.symbol}
        </span>
        <span className="text-[10px] text-base-content/60 truncate" title={asset.name}>
          {asset.name}
        </span>
      </div>
    </AssetPopover>
  )
}

const AprCell: React.FC<{ rate: number; iy: number; color: 'success' | 'warning' }> = ({
  rate,
  iy,
  color,
}) => {
  const total = rate + iy
  return (
    <div className="flex items-center gap-1">
      <span className={`text-sm font-medium tabular-nums text-${color}`}>
        {total.toFixed(2)}%
      </span>
      {iy > 0 && (
        <span
          className={`badge badge-xs bg-${color}/15 text-${color} border-0 cursor-help`}
          title={`Base rate: ${rate.toFixed(2)}% + Intrinsic yield: ${iy.toFixed(2)}%`}
        >
          +{iy.toFixed(1)}%
        </span>
      )}
    </div>
  )
}

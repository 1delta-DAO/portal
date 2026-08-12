import React, { useMemo, useState } from 'react'
import type {
  PoolConfigGroup,
  ConfigMarketItem,
  PoolDataItem,
} from '../../../sdk/lending-helper/marketTypes'
import type { UserPositionEntry } from '../../../sdk/lending-helper/userPositionTypes'
import type { TableHighlight, PoolRole, PoolSide } from '../tabs/trading/types'
import { abbreviateUsd, formatUsd } from '../../../utils/format'
import { RiskBadge } from './RiskBadge'
import { useTablePagination } from '../../../hooks/useTablePagination'
import { TablePagination } from '../../common/TablePagination'
import { EmptyState } from '../../common/EmptyState'
import { Logo } from '../../common/Logo'
import {
  CONFIG_PAGE_SIZE,
  computeConfigStats,
  configBorrowLiquidity,
  displayConfigLabel,
} from './configMarketConstants'
import { ExpandChevron } from './ConfigMarketCells'
import { CombinedDetailTable } from './CombinedDetailTable'

// `buildDetailRows` moved to CombinedDetailTable.tsx; re-exported so the
// existing test and any consumer keep their import path.
export { buildDetailRows, type DetailRow } from './CombinedDetailTable'

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
  /**
   * A config the caller wants selected — an explicit request (today: an
   * optimizer deep link naming the config its LTV/leverage were computed
   * against), as opposed to the default this view would otherwise choose.
   *
   * It outranks the default INCLUDING the user's own active e-mode: the user
   * clicked a specific row, and landing on a different config would show
   * different LTV and leverage than the numbers they clicked. Ignored when it
   * names no visible group, and dropped the moment the user picks anything
   * else, so it seeds the selection without freezing it.
   */
  pinnedConfigId?: string | null
  /** The user's active e-mode category string — matching configs are visually emphasized. */
  userActiveCategory?: string | null
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
  pinnedConfigId,
  userActiveCategory,
}) => {
  const [internalConfigId, setInternalConfigId] = useState<string | null>(null)
  const [configFilter, setConfigFilter] = useState('')
  // Tracks whether the user has explicitly interacted with the config list —
  // either selecting a different config or clicking the active row to collapse.
  // While false, the selection deterministically tracks the preferred default
  // (see below) as async data (e.g. the user's active e-mode) settles, so the
  // initial choice never depends on load ordering. Once true, we stop
  // re-asserting a default so the user's choice / collapsed state persists.
  // Reset on configGroups identity change so a lender switch gets a fresh
  // default selection.
  const [userTouched, setUserTouched] = useState(false)

  React.useEffect(() => {
    setUserTouched(false)
  }, [configGroups])

  // A NEW pin (a fresh deep link) re-opens the default tracking so it can be
  // applied even if the user had already picked a config in this mount. Keyed
  // on the value, so re-renders carrying the same pin never undo a later
  // manual choice.
  React.useEffect(() => {
    if (pinnedConfigId) setUserTouched(false)
  }, [pinnedConfigId])

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
    // Any manual toggle — open a different config or collapse the active one —
    // counts as user intent and freezes the auto-default from here on.
    setUserTouched(true)
    if (id === selectedConfigId) {
      setSelectedConfigId(null)
    } else {
      setSelectedConfigId(id)
    }
  }

  // Sort config groups: pinned config first, then the user's active e-mode,
  // then by total liquidity descending.
  //
  // The pin leads for the same reason it outranks the default selection: it is
  // an explicit request. It also has to be VISIBLE to count — this list
  // paginates at 8 and Euler V2 on Ethereum has 216 configs, so a pin left in
  // liquidity order lands ~20 pages deep, correctly selected and expanded where
  // nobody will ever see it. Sorting it to the top is the same treatment the
  // active e-mode already gets, and it puts the config on the first page rather
  // than relying on the page-follow below.
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
      if (pinnedConfigId != null) {
        if (a.configId === pinnedConfigId) return -1
        if (b.configId === pinnedConfigId) return 1
      }
      if (userActiveCategory != null) {
        const aIsActive = a.category === userActiveCategory
        const bIsActive = b.category === userActiveCategory
        if (aIsActive && !bIsActive) return -1
        if (bIsActive && !aIsActive) return 1
      }
      return configBorrowLiquidity(b) - configBorrowLiquidity(a)
    })
  }, [configGroups, userActiveCategory, configFilter, pinnedConfigId])

  // Pagination — auto-resets on filter / group-count change
  const configPagination = useTablePagination(sortedGroups, CONFIG_PAGE_SIZE, [configFilter])
  const { pagedItems: pagedGroups, page: configPage, setPage: setConfigPage } = configPagination

  /**
   * Keep the selected config on the VISIBLE page.
   *
   * Selecting a config is state, not scroll position: the list paginates at
   * CONFIG_PAGE_SIZE and a lender can have hundreds of configs — Euler V2 on Ethereum
   * returns 216, i.e. 27 pages — so a selection the user didn't click with
   * their own hands (a deep-link pin, or their active e-mode) routinely lands
   * on a page nobody is looking at. The config was selected and expanded
   * correctly; it was simply off-screen, which from the outside is
   * indistinguishable from the hand-off having opened the wrong config.
   *
   * Aligned at most once per selection, tracked by ref rather than by comparing
   * against the current page. Both alternatives are wrong: re-running on every
   * page change would trap the user on the selection's page, and re-running on
   * every `sortedGroups` change would yank them back to it each time they typed
   * in the config filter (which resets to page 0 by design).
   */
  const alignedForRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!selectedConfigId || sortedGroups.length === 0) return
    if (alignedForRef.current === selectedConfigId) return
    const idx = sortedGroups.findIndex((g) => g.configId === selectedConfigId)
    // Not in the list yet (groups still loading, or filtered out) — leave the
    // ref unset so this retries once the selection actually resolves.
    if (idx < 0) return
    alignedForRef.current = selectedConfigId
    const target = Math.floor(idx / CONFIG_PAGE_SIZE)
    if (target !== configPage) setConfigPage(target)
  }, [selectedConfigId, sortedGroups, configPage, setConfigPage])

  // The preferred default config: the user's enabled (active e-mode) config if
  // it's present, otherwise the top group (active-first, then liquidity, per the
  // sort above). Computed from settled inputs, so it's the same regardless of
  // whether `userActiveCategory` arrived before or after the groups — no race
  // between "enabled config" and "topmost".
  const preferredConfigId = useMemo(() => {
    if (sortedGroups.length === 0) return null
    // An explicitly pinned config outranks every default — it is a request,
    // not a guess. Only honoured while it names a visible group; a stale or
    // filtered-out pin falls through to the normal default rather than
    // leaving nothing selected.
    if (pinnedConfigId && sortedGroups.some((g) => g.configId === pinnedConfigId)) {
      return pinnedConfigId
    }
    if (userActiveCategory != null) {
      const active = sortedGroups.find((g) => g.category === userActiveCategory)
      if (active) return active.configId
    }
    return sortedGroups[0].configId
  }, [sortedGroups, userActiveCategory, pinnedConfigId])

  // Drive the default selection. Until the user interacts, the selection tracks
  // `preferredConfigId` and re-aligns as async data settles (so a late-loading
  // active e-mode still wins). After the user interacts we leave their choice
  // alone — except to recover if it vanishes (filtered out / lender data
  // changed), which would otherwise leave nothing selectable.
  React.useEffect(() => {
    if (!preferredConfigId) return
    const selectionValid =
      !!selectedConfigId && sortedGroups.some((g) => g.configId === selectedConfigId)
    if (userTouched) {
      if (selectedConfigId && !selectionValid) setSelectedConfigId(preferredConfigId)
      return
    }
    if (selectedConfigId !== preferredConfigId) setSelectedConfigId(preferredConfigId)
  }, [preferredConfigId, selectedConfigId, sortedGroups, userTouched])

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
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
                <tr>
                  <th className="w-[20%]">Config</th>
                  <th className="w-[16%]">Collaterals</th>
                  <th className="w-[16%]">Borrowables</th>
                  <th
                    className="w-[8%] text-right"
                    title="Highest LTV across this config's collateral assets"
                  >
                    Max LTV
                  </th>
                  <th
                    className="w-[10%] text-right"
                    title="Best deposit APR across this config's collateral assets (incl. intrinsic yield)"
                  >
                    Best APR
                  </th>
                  <th
                    className="w-[14%] text-right"
                    title="Total available borrow liquidity across borrowables"
                  >
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
                        <td className="text-right">
                          {stats.maxLtv > 0 ? (
                            <span className="text-xs font-medium tabular-nums">
                              {(stats.maxLtv * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-xs text-base-content/40">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          {stats.bestDepositApr > 0 ? (
                            <span className="text-xs font-medium text-success tabular-nums">
                              {stats.bestDepositApr.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-xs text-base-content/40">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          <span
                            className="text-xs tabular-nums"
                            title={`$${formatUsd(stats.borrowLiquidity)}`}
                          >
                            {abbreviateUsd(stats.borrowLiquidity)}
                          </span>
                        </td>
                        <td>
                          {g.configRiskLabel ? (
                            <RiskBadge
                              label={g.configRiskLabel}
                              breakdown={g.configRiskBreakdown ?? []}
                            />
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

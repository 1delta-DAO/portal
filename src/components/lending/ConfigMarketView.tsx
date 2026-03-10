import React, { useMemo, useState } from 'react'
import type {
  PoolConfigGroup,
  ConfigMarketItem,
  PoolDataItem,
} from '../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../hooks/lending/useUserData'
import type { TableHighlight, PoolRole } from './TradingDashboard/types'
import { abbreviateUsd, formatUsd } from '../../utils/format'
import { riskDotColor } from './MarketsView/helpers'
import { AssetPopover } from './AssetPopover'

interface Props {
  configGroups: PoolConfigGroup[]
  allPools: PoolDataItem[]
  selectedMarketUid?: string
  onPoolSelect: (pool: PoolDataItem) => void
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

const ROLE_STYLES: Record<PoolRole, string> = {
  input: 'bg-error/10 border-l-2 border-l-error',
  output: 'bg-success/10 border-l-2 border-l-success',
  pay: 'bg-warning/10 border-l-2 border-l-warning',
}

/** Total deposits USD across all collaterals + borrowables (deduplicated by marketUid). */
function configTotalLiquidity(g: PoolConfigGroup): number {
  const seen = new Set<string>()
  let total = 0
  for (const item of g.collaterals ?? []) {
    if (!seen.has(item.marketUid)) {
      seen.add(item.marketUid)
      total += item.totalDepositsUsd
    }
  }
  for (const item of g.borrowables ?? []) {
    if (!seen.has(item.marketUid)) {
      seen.add(item.marketUid)
      total += item.totalDepositsUsd
    }
  }
  return total
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
  const [page, setPage] = useState(0)

  // Use controlled or internal state
  const isControlled = controlledConfigId !== undefined
  const selectedConfigId = isControlled ? controlledConfigId : internalConfigId
  const setSelectedConfigId = (id: string) => {
    if (isControlled) {
      onConfigChange?.(id)
    } else {
      setInternalConfigId(id)
    }
  }

  // Sort config groups: user's active e-mode first, then by total liquidity descending
  const sortedGroups = useMemo(
    () =>
      [...configGroups].sort((a, b) => {
        if (userActiveCategory != null) {
          const aIsActive = a.category === userActiveCategory
          const bIsActive = b.category === userActiveCategory
          if (aIsActive && !bIsActive) return -1
          if (bIsActive && !aIsActive) return 1
        }
        return configTotalLiquidity(b) - configTotalLiquidity(a)
      }),
    [configGroups, userActiveCategory]
  )

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedGroups.length / PAGE_SIZE))
  const pagedGroups = useMemo(
    () => sortedGroups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sortedGroups, page]
  )

  // Reset page when groups change
  React.useEffect(() => {
    setPage(0)
  }, [configGroups.length])

  // Auto-select first config
  React.useEffect(() => {
    if (sortedGroups.length > 0 && (!selectedConfigId || !sortedGroups.find((g) => g.configId === selectedConfigId))) {
      setSelectedConfigId(sortedGroups[0].configId)
    }
  }, [sortedGroups, selectedConfigId])

  const activeGroup = useMemo(
    () => sortedGroups.find((g) => g.configId === selectedConfigId) ?? null,
    [sortedGroups, selectedConfigId]
  )

  // Map marketUid → PoolDataItem for selection
  const poolMap = useMemo(() => {
    const map = new Map<string, PoolDataItem>()
    for (const p of allPools) map.set(p.marketUid, p)
    return map
  }, [allPools])

  // Highlight map for trading view
  const highlightMap = useMemo(() => {
    const map = new Map<string, PoolRole>()
    if (highlights) {
      for (const h of highlights) map.set(h.marketUid, h.role)
    }
    return map
  }, [highlights])

  const handleRowClick = (marketUid: string) => {
    const pool = poolMap.get(marketUid)
    if (pool) onPoolSelect(pool)
  }

  if (isLoading) {
    return (
      <div className="rounded-box border border-base-300 p-6 flex justify-center">
        <span className="loading loading-spinner loading-md" />
      </div>
    )
  }

  if (configGroups.length === 0) {
    return (
      <div className="rounded-box border border-base-300 p-6 text-center text-sm text-base-content/60">
        No config data available for this lender.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Config list — paginated, sorted by liquidity */}
      <div className="rounded-box border border-base-300 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="table table-sm w-full">
            <thead>
              <tr>
                <th>Config</th>
                <th>Collaterals</th>
                <th>Borrowables</th>
                <th>Total Deposits</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {pagedGroups.map((g) => {
                const isActive = g.configId === selectedConfigId
                const isUserMode = userActiveCategory != null && g.category === userActiveCategory
                const liquidity = configTotalLiquidity(g)
                return (
                  <tr
                    key={g.configId}
                    className={`cursor-pointer transition-colors ${
                      isActive ? 'bg-primary/10' : isUserMode ? 'bg-success/5' : 'hover:bg-base-200'
                    }`}
                    onClick={() => setSelectedConfigId(g.configId)}
                  >
                    <td>
                      <span className="font-medium text-sm">
                        {g.label || `Config ${g.configId}`}
                        {isUserMode && (
                          <span className="ml-1.5 text-[9px] font-medium text-success/80 bg-success/10 px-1 py-0.5 rounded align-middle">
                            active
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      <IconStack items={g.collaterals} />
                    </td>
                    <td>
                      <IconStack items={g.borrowables} />
                    </td>
                    <td>
                      <span className="text-xs" title={`$${formatUsd(liquidity)}`}>
                        {abbreviateUsd(liquidity)}
                      </span>
                    </td>
                    <td>
                      {g.configRiskLabel ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-base-content/70">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${riskDotColor(g.configRiskLabel)}`} />
                          {g.configRiskLabel}
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/40">—</span>
                      )}
                    </td>
                  </tr>
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
            const liquidity = configTotalLiquidity(g)
            return (
              <div
                key={`m-${g.configId}`}
                className={`p-3 cursor-pointer transition-colors ${
                  isActive ? 'bg-primary/10' : isUserMode ? 'bg-success/5' : 'active:bg-base-200'
                }`}
                onClick={() => setSelectedConfigId(g.configId)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">
                    {g.label || `Config ${g.configId}`}
                    {isUserMode && (
                      <span className="ml-1.5 text-[9px] font-medium text-success/80 bg-success/10 px-1 py-0.5 rounded align-middle">
                        active
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {g.configRiskLabel && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-base-content/60">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${riskDotColor(g.configRiskLabel)}`} />
                        {g.configRiskLabel}
                      </span>
                    )}
                    <span className="text-xs text-base-content/70" title={`$${formatUsd(liquidity)}`}>
                      {abbreviateUsd(liquidity)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-base-content/60">
                  <div className="flex items-center gap-1">
                    <span>Col:</span>
                    <IconStack items={g.collaterals} max={4} />
                  </div>
                  <div className="flex items-center gap-1">
                    <span>Debt:</span>
                    <IconStack items={g.borrowables} max={4} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-base-300 bg-base-200/30">
            <span className="text-xs text-base-content/50">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedGroups.length)} of {sortedGroups.length}
            </span>
            <div className="join">
              <button
                type="button"
                className="join-item btn btn-xs btn-ghost"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                «
              </button>
              <button
                type="button"
                className="join-item btn btn-xs btn-ghost"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail view for selected config */}
      {activeGroup && (
        <div className="rounded-box border border-base-300 overflow-hidden">
          <div className="px-3 py-2 bg-base-200/50 border-b border-base-300">
            <span className="text-xs font-semibold">
              {activeGroup.label || `Config ${activeGroup.configId}`}
            </span>
          </div>
          <div className="flex flex-col md:flex-row">
            {/* Left: Collaterals */}
            <div className="flex-1 min-w-0 md:border-r border-base-300">
              <div className="px-3 py-2 bg-base-200/50 border-b border-base-300">
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
                  Collaterals
                </span>
              </div>
              <ConfigTable
                items={activeGroup.collaterals}
                type="collateral"
                selectedMarketUid={selectedMarketUid}
                userPositions={userPositions}
                highlightMap={highlightMap}
                onRowClick={handleRowClick}
              />
            </div>

            {/* Right: Borrowables */}
            <div className="flex-1 min-w-0 border-t md:border-t-0 border-base-300">
              <div className="px-3 py-2 bg-base-200/50 border-b border-base-300">
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/60">
                  Borrowables
                </span>
              </div>
              <ConfigTable
                items={activeGroup.borrowables}
                type="borrowable"
                selectedMarketUid={selectedMarketUid}
                userPositions={userPositions}
                highlightMap={highlightMap}
                onRowClick={handleRowClick}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icon stack — overlapping asset icons
// ---------------------------------------------------------------------------

const IconStack: React.FC<{ items: ConfigMarketItem[] | null; max?: number }> = ({
  items,
  max = 6,
}) => {
  if (!items || items.length === 0) {
    return <span className="text-xs text-base-content/40">—</span>
  }

  const visible = items.slice(0, max)
  const overflow = items.length - max

  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {visible.map((item) => (
          <img
            key={item.marketUid}
            src={item.underlyingInfo.asset.logoURI}
            width={22}
            height={22}
            alt={item.underlyingInfo.asset.symbol}
            title={item.underlyingInfo.asset.symbol}
            className="rounded-full object-contain w-5.5 h-5.5 border-2 border-base-100 bg-base-100"
          />
        ))}
      </div>
      {overflow > 0 && (
        <span className="text-[10px] text-base-content/50 ml-1">+{overflow}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-table for either collaterals or borrowables
// ---------------------------------------------------------------------------

interface ConfigTableProps {
  items: ConfigMarketItem[] | null
  type: 'collateral' | 'borrowable'
  selectedMarketUid?: string
  userPositions: Map<string, UserPositionEntry>
  highlightMap: Map<string, PoolRole>
  onRowClick: (marketUid: string) => void
}

const ConfigTable: React.FC<ConfigTableProps> = ({
  items,
  type,
  selectedMarketUid,
  userPositions,
  highlightMap,
  onRowClick,
}) => {
  if (!items || items.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-base-content/40">
        None
      </div>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th>Asset</th>
              {type === 'collateral' ? (
                <>
                  <th>LTV</th>
                  <th>APR</th>
                  <th>Deposits</th>
                </>
              ) : (
                <>
                  <th>APR</th>
                  <th>Liq.</th>
                  <th>Debt</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isSelected = selectedMarketUid === item.marketUid
              const role = highlightMap.get(item.marketUid)
              const userPos = userPositions.get(item.marketUid)
              const hasPosition =
                userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
              const iy = item.intrinsicYield ?? 0

              return (
                <tr
                  key={item.marketUid}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-primary/10'
                      : role
                        ? ROLE_STYLES[role]
                        : 'hover:bg-base-200'
                  }`}
                  onClick={() => onRowClick(item.marketUid)}
                >
                  <td className="max-w-36">
                    <AssetCell item={item} hasPosition={!!hasPosition} />
                  </td>
                  {type === 'collateral' ? (
                    <>
                      <td>
                        <span className="text-xs font-medium">
                          {(item.borrowCollateralFactor * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td>
                        <AprCell rate={item.depositRate} iy={iy} color="success" />
                      </td>
                      <td>
                        <span className="text-xs" title={`$${formatUsd(item.totalDepositsUsd)}`}>
                          {abbreviateUsd(item.totalDepositsUsd)}
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <AprCell rate={item.variableBorrowRate} iy={iy} color="warning" />
                      </td>
                      <td>
                        <span
                          className="text-xs"
                          title={`$${formatUsd(item.totalDepositsUsd - item.totalDebtUsd)}`}
                        >
                          {abbreviateUsd(item.totalDepositsUsd - item.totalDebtUsd)}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs" title={`$${formatUsd(item.totalDebtUsd)}`}>
                          {abbreviateUsd(item.totalDebtUsd)}
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-base-300">
        {items.map((item) => {
          const isSelected = selectedMarketUid === item.marketUid
          const role = highlightMap.get(item.marketUid)
          const userPos = userPositions.get(item.marketUid)
          const hasPosition =
            userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
          const iy = item.intrinsicYield ?? 0

          return (
            <div
              key={`m-${item.marketUid}`}
              className={`p-3 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-primary/10'
                  : role
                    ? ROLE_STYLES[role]
                    : 'active:bg-base-200'
              }`}
              onClick={() => onRowClick(item.marketUid)}
            >
              <div className="flex items-center justify-between">
                <AssetCell item={item} hasPosition={!!hasPosition} />
                <div className="text-right shrink-0">
                  {type === 'collateral' ? (
                    <>
                      <AprCell rate={item.depositRate} iy={iy} color="success" />
                      <span className="text-[10px] text-base-content/50 block">Deposit APR</span>
                    </>
                  ) : (
                    <>
                      <AprCell rate={item.variableBorrowRate} iy={iy} color="warning" />
                      <span className="text-[10px] text-base-content/50 block">Borrow APR</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-base-content/70">
                {type === 'collateral' ? (
                  <>
                    <span>
                      LTV: <span className="font-medium">{(item.borrowCollateralFactor * 100).toFixed(0)}%</span>
                    </span>
                    <span>Dep: {abbreviateUsd(item.totalDepositsUsd)}</span>
                  </>
                ) : (
                  <>
                    <span>Liq: {abbreviateUsd(item.totalDepositsUsd - item.totalDebtUsd)}</span>
                    <span>Debt: {abbreviateUsd(item.totalDebtUsd)}</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared cell components
// ---------------------------------------------------------------------------

const AssetCell: React.FC<{ item: ConfigMarketItem; hasPosition: boolean }> = ({
  item,
  hasPosition,
}) => {
  const asset = item.underlyingInfo.asset
  return (
    <AssetPopover
      address={asset.address}
      name={asset.name}
      symbol={asset.symbol}
      logoURI={asset.logoURI}
      positionDot={hasPosition}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-medium text-sm truncate" title={asset.symbol}>
          {asset.symbol}
        </span>
        <span className="text-[11px] text-base-content/60 truncate" title={asset.name}>
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
      <span className={`text-sm font-medium text-${color}`}>{total.toFixed(2)}%</span>
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

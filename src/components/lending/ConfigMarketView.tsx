import React, { useMemo, useState } from 'react'
import type {
  PoolConfigGroup,
  ConfigMarketItem,
  PoolDataItem,
} from '../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../hooks/lending/useUserData'
import type { TableHighlight, PoolRole } from './TradingDashboard/types'
import { abbreviateUsd, abbreviateNumber, formatUsd, formatTokenAmount } from '../../utils/format'
import { AssetPopover } from './AssetPopover'
import { RiskBadge } from './RiskBadge'
import { useTablePagination } from '../../hooks/useTablePagination'
import { TablePagination } from '../common/TablePagination'
import { EmptyState } from '../common/EmptyState'

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
  const sortedGroups = useMemo(() => {
    const q = configFilter.trim().toLowerCase()
    const filtered = q
      ? configGroups.filter((g) => {
          if ((g.label || g.configId).toLowerCase().includes(q)) return true
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

  return (
    <div className="space-y-3">
      {/* Config list — paginated, sorted by liquidity */}
      <div className="rounded-box border border-base-300 overflow-hidden">
        {/* Config filter */}
        {configGroups.length > 3 && (
          <div className="px-3 py-1.5 border-b border-base-300">
            <input
              type="text"
              placeholder="Filter configs by name or asset…"
              value={configFilter}
              onChange={(e) => setConfigFilter(e.target.value)}
              className="input input-xs input-bordered w-full max-w-xs bg-base-100"
            />
          </div>
        )}
        {sortedGroups.length === 0 ? (
          <EmptyState size="sm" title="No matching configs" />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="table table-sm w-full">
                <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
                  <tr>
                    <th>Config</th>
                    <th>Collaterals</th>
                    <th>Borrowables</th>
                    <th>Borrow Liquidity</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGroups.map((g) => {
                    const isActive = g.configId === selectedConfigId
                    const isUserMode = userActiveCategory != null && g.category === userActiveCategory
                    const liquidity = configBorrowLiquidity(g)
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
                              <span className="ml-1.5 text-[10px] font-medium text-success/80 bg-success/10 px-1 py-0.5 rounded align-middle">
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
                            <RiskBadge label={g.configRiskLabel} breakdown={g.configRiskBreakdown ?? []} />
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
                const liquidity = configBorrowLiquidity(g)
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
                          <span className="ml-1.5 text-[10px] font-medium text-success/80 bg-success/10 px-1 py-0.5 rounded align-middle">
                            active
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {g.configRiskLabel && (
                          <RiskBadge label={g.configRiskLabel} breakdown={g.configRiskBreakdown ?? []} size="sm" />
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
            <TablePagination pagination={configPagination} totalItems={sortedGroups.length} />
          </>
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
                poolMap={poolMap}
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
                poolMap={poolMap}
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
            className="rounded-full object-contain w-5.5 h-5.5 border-2 border-base-100 bg-base-100 token-logo"
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
  poolMap: Map<string, PoolDataItem>
}

const ConfigTable: React.FC<ConfigTableProps> = ({
  items,
  type,
  selectedMarketUid,
  userPositions,
  highlightMap,
  onRowClick,
  poolMap,
}) => {
  const [filter, setFilter] = useState('')

  const sorted = useMemo(() => {
    if (!items) return []
    let filtered = items
    const q = filter.trim().toLowerCase()
    if (q) {
      filtered = items.filter((item) => {
        const { name, symbol } = item.underlyingInfo.asset
        return name.toLowerCase().includes(q) || symbol.toLowerCase().includes(q)
      })
    }
    return [...filtered].sort((a, b) => {
      const aLiq = type === 'borrowable'
        ? (a.totalLiquidityUsd ?? (a.totalDepositsUsd - a.totalDebtUsd))
        : a.totalDepositsUsd
      const bLiq = type === 'borrowable'
        ? (b.totalLiquidityUsd ?? (b.totalDepositsUsd - b.totalDebtUsd))
        : b.totalDepositsUsd
      return bLiq - aLiq
    })
  }, [items, type, filter])

  if (!items || items.length === 0) {
    return <EmptyState size="sm" title="None" />
  }

  return (
    <>
      {/* Filter input */}
      {items.length > 3 && (
        <div className="px-3 py-1.5 border-b border-base-300">
          <input
            type="text"
            placeholder="Filter by name or symbol…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input input-xs input-bordered w-full max-w-xs bg-base-100"
          />
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState size="sm" title="No matches" />
      ) : (
      <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="table table-sm w-full">
          <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
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
            {sorted.map((item) => {
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
                    <AssetCell item={item} hasPosition={!!hasPosition} entityName={poolMap.get(item.marketUid)?.name} />
                  </td>
                  {(() => {
                    const pool = poolMap.get(item.marketUid)
                    const sym = item.underlyingInfo.asset.symbol
                    if (type === 'collateral') {
                      return (
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
                            <div className="flex flex-col">
                              <span className="text-xs" title={`$${formatUsd(item.totalDepositsUsd)}`}>
                                {abbreviateUsd(item.totalDepositsUsd)}
                              </span>
                              {pool && (
                                <span className="text-[10px] text-base-content/50" title={formatTokenAmount(pool.totalDeposits)}>
                                  {abbreviateNumber(pool.totalDeposits)} {sym}
                                </span>
                              )}
                            </div>
                          </td>
                        </>
                      )
                    }
                    return (
                      <>
                        <td>
                          <AprCell rate={item.variableBorrowRate} iy={iy} color="warning" />
                        </td>
                        <td>
                          <div className="flex flex-col">
                            {(() => {
                              const liqUsd = item.totalLiquidityUsd ?? (item.totalDepositsUsd - item.totalDebtUsd)
                              const liqToken = item.totalLiquidity ?? pool?.totalLiquidity
                              return (
                                <>
                                  <span className="text-xs" title={`$${formatUsd(liqUsd)}`}>
                                    {abbreviateUsd(liqUsd)}
                                  </span>
                                  {liqToken != null && (
                                    <span className="text-[10px] text-base-content/50" title={formatTokenAmount(liqToken)}>
                                      {abbreviateNumber(liqToken)} {sym}
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col">
                            <span className="text-xs" title={`$${formatUsd(item.totalDebtUsd)}`}>
                              {abbreviateUsd(item.totalDebtUsd)}
                            </span>
                            {pool && (
                              <span className="text-[10px] text-base-content/50" title={formatTokenAmount(pool.totalDebt)}>
                                {abbreviateNumber(pool.totalDebt)} {sym}
                              </span>
                            )}
                          </div>
                        </td>
                      </>
                    )
                  })()}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-base-300">
        {sorted.map((item) => {
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
                <AssetCell item={item} hasPosition={!!hasPosition} entityName={poolMap.get(item.marketUid)?.name} />
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
                {(() => {
                  const pool = poolMap.get(item.marketUid)
                  if (type === 'collateral') {
                    return (
                      <>
                        <span>
                          LTV: <span className="font-medium">{(item.borrowCollateralFactor * 100).toFixed(0)}%</span>
                        </span>
                        <span title={pool ? `${formatTokenAmount(pool.totalDeposits)} ${item.underlyingInfo.asset.symbol}` : undefined}>
                          Dep: {abbreviateUsd(item.totalDepositsUsd)}
                          {pool && <span className="text-base-content/40"> ({abbreviateNumber(pool.totalDeposits)})</span>}
                        </span>
                      </>
                    )
                  }
                  return (
                    <>
                      {(() => {
                        const liqUsd = item.totalLiquidityUsd ?? (item.totalDepositsUsd - item.totalDebtUsd)
                        const liqToken = item.totalLiquidity ?? pool?.totalLiquidity
                        return (
                          <span title={liqToken != null ? `${formatTokenAmount(liqToken)} ${item.underlyingInfo.asset.symbol}` : undefined}>
                            Liq: {abbreviateUsd(liqUsd)}
                            {liqToken != null && <span className="text-base-content/40"> ({abbreviateNumber(liqToken)})</span>}
                          </span>
                        )
                      })()}
                      <span title={pool ? `${formatTokenAmount(pool.totalDebt)} ${item.underlyingInfo.asset.symbol}` : undefined}>
                        Debt: {abbreviateUsd(item.totalDebtUsd)}
                        {pool && <span className="text-base-content/40"> ({abbreviateNumber(pool.totalDebt)})</span>}
                      </span>
                    </>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>
      </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared cell components
// ---------------------------------------------------------------------------

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

// src/components/LendingPoolsTable.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getChainName,
  lenderDisplayName,
  lenderDisplayNameFull,
} from '@1delta/lib-utils'
import { useFlattenedPools, PoolEntry, PoolExposure } from '../../hooks/lending/useFlattenedPools.js'
import { getFormattedPrice } from '../../utils/price.js'

type SortKey = 'apr' | 'utilization' | 'totalLiquidityUSD' | 'totalDepositsUSD'

interface LendingPoolsTableProps {
  /** Chain to display. Required – we do not allow "all chains" here. */
  chainId?: string
}

/** Compute derived values from pool data */
function computePoolMetrics(pool: PoolEntry) {
  const totalDeposits = parseFloat(pool.total_deposits) || 0
  const totalDebt = parseFloat(pool.total_debt) || 0
  const totalDepositsUSD = parseFloat(pool.total_deposits_usd) || 0

  const utilization = totalDeposits > 0 ? totalDebt / totalDeposits : 0
  const apr = (parseFloat(pool.deposit_rate) || 0) * 100
  const price = totalDeposits > 0 ? totalDepositsUSD / totalDeposits : 0

  return { utilization, apr, price }
}

export const LendingPoolsTable: React.FC<LendingPoolsTableProps> = ({ chainId }) => {
  // existing filters
  const [search, setSearch] = useState('')
  const [selectedLender, setSelectedLender] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('apr')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // pagination
  const [pageSize, setPageSize] = useState<number>(5)
  const [page, setPage] = useState<number>(1)

  // extra filters
  const [maxUtilPct, setMaxUtilPct] = useState<string>('90') // %
  const [minDepositsUsd, setMinDepositsUsd] = useState<string>('10000') // USD
  const [minAprPct, setMinAprPct] = useState<string>('1') // %
  const [assetFilter, setAssetFilter] = useState<string>('') // address / symbol / name

  const { pools, isPoolsLoading: loading } = useFlattenedPools({
    chainId,
    enabled: !!chainId,
  })

  // If no chainId is provided, we do NOT allow "all chains"
  if (!chainId) {
    return (
      <div className="w-full max-w-6xl mx-auto p-4">
        <p className="text-sm text-base-content/70">Select a chain to view lending markets.</p>
      </div>
    )
  }

  const lenders = useMemo(
    () => Array.from(new Set(pools.map((p) => p.lender_key))).sort(),
    [pools]
  )

  const filteredAndSortedPools = useMemo(() => {
    let result = pools

    // lender
    if (selectedLender !== 'all') {
      result = result.filter((p) => p.lender_key === selectedLender)
    }

    // generic search (underlying address / lender / asset group)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((p) => {
        return (
          p.underlying_address.toLowerCase().includes(q) ||
          p.lender_key.toLowerCase().includes(q) ||
          p.asset_group.toLowerCase().includes(q)
        )
      })
    }

    // asset filter (address / asset group)
    if (assetFilter.trim()) {
      const q = assetFilter.toLowerCase()
      result = result.filter((p) => {
        return (
          p.asset_group.toLowerCase().includes(q) ||
          p.underlying_address.toLowerCase().includes(q)
        )
      })
    }

    // numeric filters
    const maxUtil = parseFloat(maxUtilPct)
    if (!Number.isNaN(maxUtil)) {
      result = result.filter((p) => {
        const { utilization } = computePoolMetrics(p)
        return utilization * 100 <= maxUtil
      })
    }

    const minDeps = parseFloat(minDepositsUsd)
    if (!Number.isNaN(minDeps)) {
      result = result.filter((p) => (parseFloat(p.total_deposits_usd) || 0) >= minDeps)
    }

    const minApr = parseFloat(minAprPct)
    if (!Number.isNaN(minApr)) {
      result = result.filter((p) => {
        const { apr } = computePoolMetrics(p)
        return apr >= minApr
      })
    }

    // sort
    result = [...result].sort((a, b) => {
      const metricsA = computePoolMetrics(a)
      const metricsB = computePoolMetrics(b)

      let aVal: number
      let bVal: number

      switch (sortKey) {
        case 'apr':
          aVal = metricsA.apr
          bVal = metricsB.apr
          break
        case 'utilization':
          aVal = metricsA.utilization
          bVal = metricsB.utilization
          break
        case 'totalDepositsUSD':
          aVal = parseFloat(a.total_deposits_usd) || 0
          bVal = parseFloat(b.total_deposits_usd) || 0
          break
        case 'totalLiquidityUSD':
          aVal = parseFloat(a.total_liquidity_usd) || 0
          bVal = parseFloat(b.total_liquidity_usd) || 0
          break
        default:
          aVal = 0
          bVal = 0
      }

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [
    pools,
    search,
    selectedLender,
    sortKey,
    sortDir,
    maxUtilPct,
    minDepositsUsd,
    minAprPct,
    assetFilter,
  ])

  // pagination info
  const totalItems = filteredAndSortedPools.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const paginatedPools = filteredAndSortedPools.slice(startIndex, endIndex)

  // reset to first page when filters change
  useEffect(() => {
    setPage(1)
  }, [
    search,
    selectedLender,
    sortKey,
    sortDir,
    pageSize,
    maxUtilPct,
    minDepositsUsd,
    minAprPct,
    assetFilter,
    chainId,
  ])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setPage(newPage)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-4">
      {/* Top row: title + main controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Lending Markets</h2>
          <p className="text-sm text-base-content/70">
            Flattened view of pools enriched with APR, utilization and exposure.
          </p>
          <p className="text-xs text-base-content/50 mt-1">{getChainName(chainId)}</p>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <input
            type="text"
            placeholder="Search asset / lender"
            className="input input-bordered input-sm w-full md:w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="select select-bordered select-sm"
            value={selectedLender}
            onChange={(e) => setSelectedLender(e.target.value)}
          >
            <option value="all">All lenders</option>
            {lenders.map((l) => (
              <option key={l} value={l}>
                {lenderDisplayNameFull(l)}
              </option>
            ))}
          </select>

          {/* page size selector */}
          <select
            className="select select-bordered select-sm"
            value={pageSize}
            onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
          >
            <option value={5}>5 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      </div>

      {/* numeric + asset filters row */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="form-control w-24">
          <label className="label py-0">
            <span className="label-text text-xs">Max Util (%)</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            className="input input-bordered input-xs"
            placeholder="e.g. 60"
            value={maxUtilPct}
            onChange={(e) => setMaxUtilPct(e.target.value)}
          />
        </div>

        <div className="form-control w-28">
          <label className="label py-0">
            <span className="label-text text-xs">Min APR (%)</span>
          </label>
          <input
            type="number"
            min={0}
            className="input input-bordered input-xs"
            placeholder="e.g. 5"
            value={minAprPct}
            onChange={(e) => setMinAprPct(e.target.value)}
          />
        </div>

        <div className="form-control w-36">
          <label className="label py-0">
            <span className="label-text text-xs">Min Deposits (USD)</span>
          </label>
          <input
            type="number"
            min={0}
            className="input input-bordered input-xs"
            placeholder="e.g. 100000"
            value={minDepositsUsd}
            onChange={(e) => setMinDepositsUsd(e.target.value)}
          />
        </div>

        <div className="form-control w-36">
          <label className="label py-0">
            <span className="label-text text-xs">Asset (addr / symbol)</span>
          </label>
          <input
            type="text"
            className="input input-bordered input-xs"
            placeholder="e.g. USDC, 0x..."
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
          />
        </div>
      </div>

      {/* table */}
      <div className="rounded-box border border-base-300 overflow-visible">
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm table-fixed w-full">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Lender</th>
                <th className="cursor-pointer" onClick={() => toggleSort('apr')}>
                  APR
                  {sortKey === 'apr' && (
                    <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th className="cursor-pointer" onClick={() => toggleSort('utilization')}>
                  Utilization
                  {sortKey === 'utilization' && (
                    <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th className="cursor-pointer" onClick={() => toggleSort('totalDepositsUSD')}>
                  Deposits (USD)
                  {sortKey === 'totalDepositsUSD' && (
                    <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th className="cursor-pointer" onClick={() => toggleSort('totalLiquidityUSD')}>
                  Liquidity (USD)
                  {sortKey === 'totalLiquidityUSD' && (
                    <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th>Price</th>
                <th>Exposures</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPools.map((p) => {
                const { utilization, apr, price } = computePoolMetrics(p)
                const utilPct = utilization * 100
                const totalDepositsUSD = parseFloat(p.total_deposits_usd) || 0
                const totalDebtUSD = parseFloat(p.total_debt_usd) || 0
                const totalLiquidityUSD = parseFloat(p.total_liquidity_usd) || 0

                return (
                  <tr key={`${p.chain_id}-${p.lender_key}-${p.underlying_address}`} className="h-[75px]">
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className="font-medium">{p.asset_group}</span>
                          <span className="text-xs text-base-content/60 font-mono">
                            {p.underlying_address.slice(0, 6)}...{p.underlying_address.slice(-4)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">{lenderDisplayName(p.lender_key)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">{apr.toFixed(2)}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <progress
                          className="progress progress-primary w-24"
                          value={utilPct}
                          max={100}
                        />
                        <span className="text-xs font-medium">{utilPct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">
                          $
                          {totalDepositsUSD.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                        <span className="text-base-content/60">
                          Debt: $
                          {totalDebtUSD.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs font-semibold">
                        $
                        {totalLiquidityUSD.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        {price > 0 && (
                          <span className="font-semibold">${getFormattedPrice(price)}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <ExposureCell exposures={p.exposures} />
                    </td>
                  </tr>
                )
              })}

              {filteredAndSortedPools.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-6 text-sm">
                    No pools match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* pagination footer */}
        <div className="flex flex-col gap-2 items-center justify-between md:flex-row px-4 py-2">
          <div className="text-xs text-base-content/70">
            {totalItems === 0 ? (
              'No results'
            ) : (
              <>
                Showing{' '}
                <span className="font-semibold">
                  {startIndex + 1}–{endIndex}
                </span>{' '}
                of <span className="font-semibold">{totalItems}</span> pools
              </>
            )}
          </div>
          <div className="join">
            <button
              className="btn btn-xs join-item"
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              « Prev
            </button>
            <button className="btn btn-xs join-item" disabled>
              Page {currentPage} / {totalPages}
            </button>
            <button
              className="btn btn-xs join-item"
              disabled={currentPage === totalPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next »
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Exposure cell with inline badges + N-more popover rendered via portal.
 * Badges are width-limited and truncated, with full info in native tooltips.
 */
const ExposureCell: React.FC<{ exposures: PoolExposure[] }> = ({ exposures }) => {
  const meaningful = exposures.filter((e) => e.configId !== 0)

  const maxInline = 2
  const inline = meaningful.slice(0, maxInline)
  const remaining = meaningful.slice(maxInline)

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement | null>(null)

  const openPopover = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 8, // a bit below
      left: rect.right, // right-aligned
    })
    setOpen(true)
  }

  const closePopover = () => {
    setOpen(false)
  }

  if (meaningful.length === 0) {
    return <span className="text-xs text-base-content/40">—</span>
  }

  const badgeTitle = (ex: PoolExposure) =>
    `${ex.label} – collaterals: ${ex.collaterals?.length ?? 0}, debts: ${ex.debts?.length ?? 0} (configId: ${ex.configId})`

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 max-w-56">
        {inline.map((ex) => (
          <span
            key={ex.configId}
            className="badge badge-outline badge-sm text-xs max-w-28 overflow-hidden"
            title={badgeTitle(ex)}
          >
            <span className="truncate max-w-24 inline-block align-middle">{ex.label}</span>
          </span>
        ))}

        {remaining.length > 0 && (
          <span
            ref={triggerRef}
            tabIndex={0}
            className="badge badge-ghost badge-sm cursor-pointer text-xs"
            onClick={openPopover}
            title={remaining.map((ex) => badgeTitle(ex)).join('\n')}
          >
            +{remaining.length} more
          </span>
        )}
      </div>

      {open &&
        pos &&
        createPortal(
          <>
            {/* backdrop to close on click */}
            <div className="fixed inset-0 z-90" onClick={closePopover} />

            <div
              className="fixed z-100 shadow bg-base-100 rounded-box p-2 max-w-xs max-h-60 overflow-auto"
              style={{
                top: pos.top,
                left: pos.left,
              }}
            >
              <div className="flex flex-wrap gap-1">
                {remaining.map((ex) => (
                  <span
                    key={ex.configId}
                    className="badge badge-outline badge-sm text-xs max-w-28 overflow-hidden"
                    title={badgeTitle(ex)}
                  >
                    <span className="truncate max-w-24 inline-block align-middle">
                      {ex.label}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  )
}

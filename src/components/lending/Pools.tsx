// src/components/LendingPoolsTable.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { RawCurrency } from '@1delta/lib-utils'
import { useFlattenedPools } from '../../hooks/lending/useEarnData.js'
import { createPortal } from 'react-dom'

type SortKey = 'apr' | 'utilitzation' | 'totalLiquidityUSD' | 'totalDepositsUSD'

interface LendingPoolsTableProps {}

function getLenderName(a: string) {
  return a.length > 10 ? a.slice(0, 12) + '...' : a
}

/**
 * Utility to render a GenericCurrency nicely even if the shape differs.
 */
const renderCurrency = (asset: RawCurrency) => {
  const symbol = asset?.symbol ?? (asset as any)?.ticker ?? ''
  const name = asset?.name ?? (asset as any)?.label ?? symbol
  return (
    <div className="flex items-center gap-2">
      <div className="avatar placeholder">
        <div className="bg-base-300 text-base-content rounded-full w-7 flex items-center justify-center overflow-hidden">
          {asset.logoURI && (
            <img src={asset.logoURI} width="20" height="20" alt={symbol} />
          )}
        </div>
      </div>
      <div className="flex flex-col">
        <span className="font-medium">{symbol || name}</span>
        {name && symbol && name !== symbol && (
          <span className="text-xs text-base-content/60">{name}</span>
        )}
      </div>
    </div>
  )
}

export const LendingPoolsTable: React.FC<LendingPoolsTableProps> = () => {
  // existing filters
  const [search, setSearch] = useState('')
  const [selectedChain, setSelectedChain] = useState<string>('all')
  const [selectedLender, setSelectedLender] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('apr')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // pagination
  const [pageSize, setPageSize] = useState<number>(5)
  const [page, setPage] = useState<number>(1)

  // NEW: extra filters
  const [maxUtilPct, setMaxUtilPct] = useState<string>('90') // %
  const [minDepositsUsd, setMinDepositsUsd] = useState<string>('10000') // USD
  const [minAprPct, setMinAprPct] = useState<string>('1') // %
  const [assetFilter, setAssetFilter] = useState<string>('USD') // address / symbol / name

  const { pools, isPoolsLoading: loading } = useFlattenedPools()

  const chains = useMemo(
    () => Array.from(new Set(pools.map((p) => p.chainId))).sort(),
    [pools]
  )

  const lenders = useMemo(
    () => Array.from(new Set(pools.map((p) => p.lender))).sort(),
    [pools]
  )

  const filteredAndSortedPools = useMemo(() => {
    let result = pools

    // chain & lender
    if (selectedChain !== 'all') {
      result = result.filter((p) => p.chainId === selectedChain)
    }
    if (selectedLender !== 'all') {
      result = result.filter((p) => p.lender === selectedLender)
    }

    // generic search (pool / lender / asset symbol / name)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((p) => {
        const symbol =
          (p.asset as any)?.symbol ?? (p.asset as any)?.ticker ?? ''
        const name = (p.asset as any)?.name ?? ''
        return (
          p.poolId.toLowerCase().includes(q) ||
          p.lender.toLowerCase().includes(q) ||
          symbol.toLowerCase().includes(q) ||
          name.toLowerCase().includes(q)
        )
      })
    }

    // NEW: asset filter (address / symbol / name)
    if (assetFilter.trim()) {
      const q = assetFilter.toLowerCase()
      result = result.filter((p) => {
        const asset = p.asset as any
        const symbol = asset?.symbol ?? asset?.ticker ?? ''
        const name = asset?.name ?? ''
        const address = asset?.address ?? asset?.addr ?? ''
        return (
          symbol.toLowerCase().includes(q) ||
          name.toLowerCase().includes(q) ||
          address.toLowerCase().includes(q)
        )
      })
    }

    // NEW: numeric filters
    const maxUtil = parseFloat(maxUtilPct)
    if (!Number.isNaN(maxUtil)) {
      result = result.filter((p) => (p.utilitzation ?? 0) * 100 <= maxUtil)
    }

    const minDeps = parseFloat(minDepositsUsd)
    if (!Number.isNaN(minDeps)) {
      result = result.filter((p) => p.totalDepositsUSD >= minDeps)
    }

    const minApr = parseFloat(minAprPct)
    if (!Number.isNaN(minApr)) {
      result = result.filter((p) => (p.apr ?? 0) * 100 >= minApr)
    }

    // sort
    result = [...result].sort((a, b) => {
      const aVal = (a as any)[sortKey] ?? 0
      const bVal = (b as any)[sortKey] ?? 0
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [
    pools,
    search,
    selectedChain,
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
    selectedChain,
    selectedLender,
    sortKey,
    sortDir,
    pageSize,
    maxUtilPct,
    minDepositsUsd,
    minAprPct,
    assetFilter,
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
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <input
            type="text"
            placeholder="Search asset / pool / lender"
            className="input input-bordered input-sm w-full md:w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="select select-bordered select-sm"
            value={selectedChain}
            onChange={(e) => setSelectedChain(e.target.value)}
          >
            <option value="all">All chains</option>
            {chains.map((c) => (
              <option key={c} value={c}>
                Chain {c}
              </option>
            ))}
          </select>

          <select
            className="select select-bordered select-sm"
            value={selectedLender}
            onChange={(e) => setSelectedLender(e.target.value)}
          >
            <option value="all">All lenders</option>
            {lenders.map((l) => (
              <option key={l} value={l}>
                {l}
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

      {/* NEW: numeric + asset filters row */}
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
            <span className="label-text text-xs">
              Asset (addr / symbol / name)
            </span>
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
                <th>Chain / Lender</th>
                <th
                  className="cursor-pointer"
                  onClick={() => toggleSort('apr')}
                >
                  APR
                  {sortKey === 'apr' && (
                    <span className="ml-1 text-xs">
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th
                  className="cursor-pointer"
                  onClick={() => toggleSort('utilitzation')}
                >
                  Utilization
                  {sortKey === 'utilitzation' && (
                    <span className="ml-1 text-xs">
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th
                  className="cursor-pointer"
                  onClick={() => toggleSort('totalDepositsUSD')}
                >
                  Deposits (USD)
                  {sortKey === 'totalDepositsUSD' && (
                    <span className="ml-1 text-xs">
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th
                  className="cursor-pointer"
                  onClick={() => toggleSort('totalLiquidityUSD')}
                >
                  Liquidity (USD)
                  {sortKey === 'totalLiquidityUSD' && (
                    <span className="ml-1 text-xs">
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th>Exposure</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPools.map((p) => {
                const utilPct = (p.utilitzation ?? 0) * 100
                const aprPct = p.apr ?? 0
                return (
                  <tr
                    key={`${p.chainId}-${p.lender}-${p.poolId}`}
                    className="h-[75px]"
                  >
                    <td>{renderCurrency(p.asset as RawCurrency)}</td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">
                          {getLenderName(p.lender)}
                        </span>
                        <span className="text-base-content/60">
                          Chain {p.chainId}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">
                          {aprPct.toFixed(2)}%
                        </span>
                        {/* <span className="text-base-content/60">
                        Deposit: {(p.depositRate * 100).toFixed(2)}%
                      </span>
                      <span className="text-base-content/60">
                        Var borrow: {(p.variableBorrowRate * 100).toFixed(2)}%
                      </span> */}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <progress
                          className="progress progress-primary w-24"
                          value={utilPct}
                          max={100}
                        />
                        <span className="text-xs font-medium">
                          {utilPct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold">
                          $
                          {p.totalDepositsUSD.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                        <span className="text-base-content/60">
                          Debt: $
                          {p.totalDebtUSD.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs font-semibold">
                        $
                        {p.totalLiquidityUSD.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </td>
                    {/* Exposure cell replaced with ExposureCell */}
                    <td className="align-top">
                      <ExposureCell exposures={p.exposure as any[]} />
                    </td>

                    <td>
                      <div className="flex flex-col text-xs">
                        {p.price != null && (
                          <span className="font-semibold">
                            ${p.price?.toFixed(4)}
                          </span>
                        )}
                        {p.histPrice != null && (
                          <span className="text-base-content/60 whitespace-nowrap">
                            24h: ${p.histPrice?.toFixed(4)}
                          </span>
                        )}
                        {p.price != null &&
                          p.histPrice != null &&
                          p.histPrice !== 0 && (
                            <span
                              className={`text-xs whitespace-nowrap ${
                                p.price >= p.histPrice
                                  ? 'text-success'
                                  : 'text-error'
                              }`}
                            >
                              {(
                                ((p.price - p.histPrice) / p.histPrice) *
                                100
                              ).toFixed(2)}
                              %
                            </span>
                          )}
                      </div>
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
 */
const ExposureCell: React.FC<{ exposures: any[] }> = ({ exposures }) => {
  const maxInline = 2
  const inline = exposures.slice(0, maxInline)
  const remaining = exposures.slice(maxInline)

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

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 max-w-[14rem]">
        {inline.map((ex, i) => {
          const exSymbol = ex.asset?.symbol ?? ex.asset?.ticker ?? ''
          return (
            <span
              key={`${exSymbol}-${i}`}
              className="badge badge-outline badge-sm"
              title={`Collateral factor: ${ex.collateralFactor * 100}%`}
            >
              {exSymbol || 'UNKNOWN'}{' '}
              <span className="opacity-60">
                ({(ex.collateralFactor * 100).toFixed(0)}%)
              </span>
            </span>
          )
        })}

        {remaining.length > 0 && (
          <span
            ref={triggerRef}
            tabIndex={0}
            className="badge badge-ghost badge-sm cursor-pointer"
            onClick={openPopover}
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
            <div className="fixed inset-0 z-[90]" onClick={closePopover} />

            <div
              className="fixed z-[100] shadow bg-base-100 rounded-box p-2 max-w-xs max-h-60 overflow-auto"
              style={{
                top: pos.top,
                left: pos.left,
              }}
            >
              <div className="flex flex-wrap gap-1">
                {remaining.map((ex, i) => {
                  const exSymbol = ex.asset?.symbol ?? ex.asset?.ticker ?? ''
                  return (
                    <span
                      key={`${exSymbol}-more-${i}`}
                      className="badge badge-outline badge-sm"
                      title={`Collateral factor: ${ex.collateralFactor * 100}%`}
                    >
                      {exSymbol || 'UNKNOWN'}{' '}
                      <span className="opacity-60">
                        {(ex.collateralFactor * 100).toFixed(0)}%
                      </span>
                    </span>
                  )
                })}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  )
}

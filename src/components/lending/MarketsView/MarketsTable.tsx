import React from 'react'
import type { PoolEntry } from '../../../hooks/lending/useFlattenedPools'
import { abbreviateUsd, formatUsd } from '../../../utils/format'
import { getFormattedPrice } from '../../../utils/price'
import { computePoolMetrics, riskGrade, riskBadgeClass, type SortKey } from './helpers'
import { ExposureCell } from './ExposureCell'
import { lenderDisplayName } from '@1delta/lib-utils'

interface MarketsTableProps {
  pools: PoolEntry[]
  chainTokens: Record<string, any>
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onToggleSort: (key: SortKey) => void
  selectedEntry: PoolEntry | null
  onRowClick: (entry: PoolEntry) => void
  totalItems: number
  startIndex: number
  endIndex: number
  currentPage: number
  totalPages: number
  onGoToPage: (page: number) => void
  isFetchingMore?: boolean
}

export const MarketsTable: React.FC<MarketsTableProps> = ({
  pools,
  chainTokens,
  sortKey,
  sortDir,
  onToggleSort,
  selectedEntry,
  onRowClick,
  totalItems,
  startIndex,
  endIndex,
  currentPage,
  totalPages,
  onGoToPage,
  isFetchingMore,
}) => {
  const getAsset = (p: PoolEntry) => p.underlyingInfo?.asset

  const isRowSelected = (entry: PoolEntry) =>
    selectedEntry !== null && selectedEntry.marketUid === entry.marketUid

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (
      <span className="ml-1 text-xs">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
    ) : null

  const pagination = (
    <div className="flex flex-col gap-2 items-center justify-between md:flex-row px-4 py-2">
      <div className="text-xs text-base-content/70">
        {totalItems === 0 ? (
          'No results'
        ) : (
          <>
            Showing{' '}
            <span className="font-semibold">
              {startIndex + 1}&ndash;{endIndex}
            </span>{' '}
            of <span className="font-semibold">{totalItems}</span> pools
            {isFetchingMore && (
              <span className="inline-flex items-center gap-1 ml-1">
                <span className="loading loading-spinner loading-xs" />
                loading more…
              </span>
            )}
          </>
        )}
      </div>
      <div className="join">
        <button
          className="btn btn-xs join-item"
          disabled={currentPage === 1}
          onClick={() => onGoToPage(currentPage - 1)}
        >
          &laquo; Prev
        </button>
        <button className="btn btn-xs join-item" disabled>
          Page {currentPage} / {totalPages}
        </button>
        <button
          className="btn btn-xs join-item"
          disabled={currentPage === totalPages}
          onClick={() => onGoToPage(currentPage + 1)}
        >
          Next &raquo;
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex-1 min-w-0 rounded-box border border-base-300 overflow-hidden">
      {/* ── Desktop table ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="table table-sm table-fixed w-full">
          <thead>
            <tr>
              <th>Market</th>
              <th className="cursor-pointer" onClick={() => onToggleSort('apr')}>
                APR{sortIndicator('apr')}
              </th>
              <th className="cursor-pointer" onClick={() => onToggleSort('utilization')}>
                Utilization{sortIndicator('utilization')}
              </th>
              <th className="cursor-pointer" onClick={() => onToggleSort('totalDepositsUSD')}>
                Deposits{sortIndicator('totalDepositsUSD')}
              </th>
              <th className="cursor-pointer" onClick={() => onToggleSort('totalLiquidityUSD')}>
                Liquidity{sortIndicator('totalLiquidityUSD')}
              </th>
              <th>Price</th>
              <th className="cursor-pointer" onClick={() => onToggleSort('riskScore')}>
                Risk{sortIndicator('riskScore')}
              </th>
              <th>Exposures</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => {
              const { utilization, apr, intrinsicYield, price } = computePoolMetrics(p)
              const utilPct = utilization * 100
              const totalDepositsUSD = parseFloat(p.totalDepositsUsd) || 0
              const totalDebtUSD = parseFloat(p.totalDebtUsd) || 0
              const totalLiquidityUSD = parseFloat(p.totalLiquidityUsd) || 0
              const selected = isRowSelected(p)

              return (
                <tr
                  key={p.marketUid}
                  className={`h-[75px] cursor-pointer transition-colors ${
                    selected ? 'bg-primary/10' : 'hover:bg-base-content/5'
                  }`}
                  onClick={() => onRowClick(p)}
                >
                  <td>
                    <div className="flex items-center gap-2 min-w-0" title={p.underlyingAddress}>
                      {getAsset(p)?.logoURI ? (
                        <img
                          src={getAsset(p)!.logoURI}
                          width={24}
                          height={24}
                          alt={getAsset(p)!.symbol}
                          className="rounded-full object-contain w-6 h-6 shrink-0"
                        />
                      ) : (
                        <div className="bg-base-300 rounded-full w-6 h-6 shrink-0 flex items-center justify-center text-xs font-bold">
                          {(getAsset(p)?.symbol ?? p.name).charAt(0)}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate" title={p.name}>
                          {p.name}
                        </span>
                        <span
                          className="text-[11px] text-base-content/60 truncate"
                          title={p.lenderKey}
                        >
                          {lenderDisplayName(p.lenderKey)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="font-semibold text-success">
                        {(apr + intrinsicYield).toFixed(2)}%
                      </span>
                      {intrinsicYield > 0 && (
                        <span
                          className="badge badge-xs bg-success/15 text-success border-0 cursor-help"
                          title={`Base rate: ${apr.toFixed(2)}% + Intrinsic yield: ${intrinsicYield.toFixed(2)}%`}
                        >
                          +{intrinsicYield.toFixed(1)}%
                        </span>
                      )}
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
                      <span className="font-semibold" title={`$${formatUsd(totalDepositsUSD)}`}>
                        {abbreviateUsd(totalDepositsUSD)}
                      </span>
                      <span className="text-base-content/60" title={`$${formatUsd(totalDebtUSD)}`}>
                        Debt: {abbreviateUsd(totalDebtUSD)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className="text-xs font-semibold"
                      title={`$${formatUsd(totalLiquidityUSD)}`}
                    >
                      {abbreviateUsd(totalLiquidityUSD)}
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
                    {p.riskScore != null ? (
                      <div
                        className="tooltip tooltip-left"
                        data-tip={`Chain: ${riskGrade(p.chainRiskScore)} · Lender: ${riskGrade(p.lenderRiskScore)}`}
                      >
                        <span
                          className={`badge badge-sm ${riskBadgeClass(riskGrade(p.riskScore))} cursor-help`}
                        >
                          {riskGrade(p.riskScore)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-base-content/40">—</span>
                    )}
                  </td>
                  <td>
                    <ExposureCell exposures={p.exposures} chainTokens={chainTokens} />
                  </td>
                </tr>
              )
            })}

            {totalItems === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-6 text-sm">
                  No pools match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card list ── */}
      <div className="md:hidden divide-y divide-base-300">
        {pools.length === 0 && totalItems === 0 && (
          <div className="text-center py-6 text-sm text-base-content/60">
            No pools match your filters.
          </div>
        )}

        {/* Sort controls for mobile */}
        {pools.length > 0 && (
          <div className="flex gap-1 p-2 overflow-x-auto">
            {(['apr', 'utilization', 'totalDepositsUSD', 'totalLiquidityUSD'] as SortKey[]).map(
              (key) => {
                const labels: Record<SortKey, string> = {
                  apr: 'APR',
                  utilization: 'Util',
                  totalDepositsUSD: 'Deposits',
                  totalLiquidityUSD: 'Liquidity',
                  riskScore: 'Risk',
                }
                return (
                  <button
                    key={key}
                    type="button"
                    className={`btn btn-xs ${sortKey === key ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => onToggleSort(key)}
                  >
                    {labels[key]}
                    {sortKey === key && (
                      <span className="ml-0.5">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </button>
                )
              }
            )}
          </div>
        )}

        {pools.map((p) => {
          const { utilization, apr, borrowApr, intrinsicYield, price } = computePoolMetrics(p)
          const utilPct = utilization * 100
          const totalDepositsUSD = parseFloat(p.totalDepositsUsd) || 0
          const totalLiquidityUSD = parseFloat(p.totalLiquidityUsd) || 0
          const selected = isRowSelected(p)
          const depTotal = apr + intrinsicYield
          const borTotal = borrowApr + intrinsicYield

          return (
            <div
              key={`m-${p.chainId}-${p.lenderKey}-${p.underlyingAddress}`}
              className={`p-3 cursor-pointer transition-colors ${
                selected ? 'bg-primary/10' : 'active:bg-base-content/5'
              }`}
              onClick={() => onRowClick(p)}
            >
              {/* Row 1: Asset + APR */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getAsset(p)?.logoURI ? (
                    <img
                      src={getAsset(p)!.logoURI}
                      width={28}
                      height={28}
                      alt={getAsset(p)!.symbol}
                      className="rounded-full object-contain w-7 h-7 shrink-0"
                    />
                  ) : (
                    <div className="bg-base-300 rounded-full w-7 h-7 shrink-0 flex items-center justify-center text-xs font-bold">
                      {(getAsset(p)?.symbol ?? p.name).charAt(0)}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-sm truncate" title={p.name}>
                      {p.name}
                    </span>
                    <span className="text-[11px] text-base-content/60 truncate" title={p.lenderKey}>
                      {p.lenderKey}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-bold text-sm text-success">{depTotal.toFixed(2)}%</span>
                    {intrinsicYield > 0 && (
                      <span
                        className="badge badge-xs bg-success/15 text-success border-0"
                        title={`Base rate: ${apr.toFixed(2)}% + Intrinsic yield: ${intrinsicYield.toFixed(2)}%`}
                      >
                        +{intrinsicYield.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-base-content/50 block">Deposit APR</span>
                </div>
              </div>

              {/* Row 2: Stats */}
              <div className="flex items-center justify-between mt-2 text-xs text-base-content/70">
                <span>
                  Borrow: <span className="text-warning font-medium">{borTotal.toFixed(2)}%</span>
                  {intrinsicYield > 0 && (
                    <span
                      className="badge badge-xs bg-warning/15 text-warning border-0 ml-1"
                      title={`Base rate: ${borrowApr.toFixed(2)}% + Intrinsic yield: ${intrinsicYield.toFixed(2)}%`}
                    >
                      +{intrinsicYield.toFixed(1)}%
                    </span>
                  )}
                </span>
                <span>Dep: {abbreviateUsd(totalDepositsUSD)}</span>
                <span>Liq: {abbreviateUsd(totalLiquidityUSD)}</span>
                {p.riskScore != null && (
                  <div
                    className="tooltip tooltip-left"
                    data-tip={`Chain: ${riskGrade(p.chainRiskScore)} · Lender: ${riskGrade(p.lenderRiskScore)}`}
                  >
                    <span
                      className={`badge badge-xs ${riskBadgeClass(riskGrade(p.riskScore))} cursor-help`}
                    >
                      {riskGrade(p.riskScore)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {pagination}
    </div>
  )
}

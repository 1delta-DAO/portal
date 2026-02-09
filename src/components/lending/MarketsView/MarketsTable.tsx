import React from 'react'
import { lenderDisplayName } from '@1delta/lib-utils'
import type { PoolEntry } from '../../../hooks/lending/useFlattenedPools'
import { abbreviateUsd, formatUsd } from '../../../utils/format'
import { getFormattedPrice } from '../../../utils/price'
import { computePoolMetrics, type SortKey } from './helpers'
import { ExposureCell } from './ExposureCell'

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
}) => {
  const isRowSelected = (entry: PoolEntry) =>
    selectedEntry !== null &&
    selectedEntry.lenderKey === entry.lenderKey &&
    selectedEntry.underlyingAddress === entry.underlyingAddress

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (
      <span className="ml-1 text-xs">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
    ) : null

  return (
    <div className="flex-1 rounded-box border border-base-300 overflow-visible">
      <div className="overflow-x-auto">
        <table className="table table-zebra table-sm table-fixed w-full">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Lender</th>
              <th className="cursor-pointer" onClick={() => onToggleSort('apr')}>
                APR{sortIndicator('apr')}
              </th>
              <th className="cursor-pointer" onClick={() => onToggleSort('utilization')}>
                Utilization{sortIndicator('utilization')}
              </th>
              <th className="cursor-pointer" onClick={() => onToggleSort('totalDepositsUSD')}>
                Deposits (USD){sortIndicator('totalDepositsUSD')}
              </th>
              <th className="cursor-pointer" onClick={() => onToggleSort('totalLiquidityUSD')}>
                Liquidity (USD){sortIndicator('totalLiquidityUSD')}
              </th>
              <th>Price</th>
              <th>Exposures</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => {
              const { utilization, apr, price } = computePoolMetrics(p)
              const utilPct = utilization * 100
              const totalDepositsUSD = parseFloat(p.totalDepositsUsd) || 0
              const totalDebtUSD = parseFloat(p.totalDebtUsd) || 0
              const totalLiquidityUSD = parseFloat(p.totalLiquidityUsd) || 0
              const selected = isRowSelected(p)

              return (
                <tr
                  key={`${p.chainId}-${p.lenderKey}-${p.underlyingAddress}`}
                  className={`h-[75px] cursor-pointer transition-colors ${
                    selected ? 'bg-primary/10' : 'hover:bg-base-200'
                  }`}
                  onClick={() => onRowClick(p)}
                >
                  <td>
                    <div className="flex items-center gap-2" title={p.underlyingAddress}>
                      {chainTokens[p.underlyingAddress]?.logoURI ? (
                        <img
                          src={chainTokens[p.underlyingAddress].logoURI}
                          width={24}
                          height={24}
                          alt={p.assetGroup}
                          className="rounded-full object-cover w-6 h-6 shrink-0"
                        />
                      ) : (
                        <div className="bg-base-300 rounded-full w-6 h-6 shrink-0 flex items-center justify-center text-xs font-bold">
                          {p.assetGroup.charAt(0)}
                        </div>
                      )}
                      <span className="font-medium">
                        {chainTokens[p.underlyingAddress]?.symbol ?? p.assetGroup}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col text-xs">
                      <span className="font-semibold">{lenderDisplayName(p.lenderKey)}</span>
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
                      <span className="font-semibold" title={`$${formatUsd(totalDepositsUSD)}`}>
                        {abbreviateUsd(totalDepositsUSD)}
                      </span>
                      <span
                        className="text-base-content/60"
                        title={`$${formatUsd(totalDebtUSD)}`}
                      >
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

      {/* Pagination footer */}
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
    </div>
  )
}

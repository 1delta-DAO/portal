import React, { useEffect, useMemo, useState } from 'react'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import type { TableHighlight, PoolRole } from './types'
import { abbreviateUsd, abbreviateNumber, formatUsd, formatTokenAmount } from '../../../utils/format'
import { AssetPopover } from '../AssetPopover'
import { sortPools, type SortKey, LtvBadge } from '../Dashboard'
import { RiskBadge } from '../RiskBadge'

const PAGE_SIZE = 25

interface Props {
  pools: PoolDataItem[]
  userPositions: Map<string, UserPositionEntry>
  highlights: TableHighlight[]
}

const ROLE_STYLES: Record<PoolRole, string> = {
  input: 'bg-error/10 border-l-2 border-l-error',
  output: 'bg-success/10 border-l-2 border-l-success',
  pay: 'bg-warning/10 border-l-2 border-l-warning',
}

export const TradingMarketTable: React.FC<Props> = ({ pools, userPositions, highlights }) => {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('totalDepositsUSD')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const highlightMap = useMemo(() => {
    const map = new Map<string, PoolRole>()
    for (const h of highlights) map.set(h.marketUid, h.role)
    return map
  }, [highlights])

  const [page, setPage] = useState(0)

  const sorted = useMemo(
    () => sortPools(pools, search, sortKey, sortDir),
    [pools, search, sortKey, sortDir]
  )

  // Reset to first page when search/sort/pool list changes
  const sortedCount = sorted.length
  useEffect(() => setPage(0), [search, sortKey, sortDir, sortedCount])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pagedPools = useMemo(
    () => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sorted, page]
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (
      <span className="ml-1 text-xs">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
    ) : null

  const MOBILE_ROLE_STYLES: Record<PoolRole, string> = {
    input: 'border-l-2 border-l-error bg-error/10',
    output: 'border-l-2 border-l-success bg-success/10',
    pay: 'border-l-2 border-l-warning bg-warning/10',
  }

  return (
    <div className="rounded-box border border-base-300 overflow-hidden">
      {/* Legend + Search */}
      <div className="p-2 border-b border-base-300 flex items-center gap-3">
        <input
          type="text"
          placeholder="Search..."
          className="input input-bordered input-sm flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-2 text-[10px] text-base-content/50 shrink-0">
          {highlights.length > 0 && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-error inline-block" />
                In
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success inline-block" />
                Out
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-warning inline-block" />
                Pay
              </span>
              <span className="mx-0.5">|</span>
            </>
          )}
          <span className="flex items-center gap-1" title="Deposits &amp; borrows are paused">
            <span className="text-warning text-sm">&#x2744;</span>Paused
          </span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('symbol')}>
                Asset{sortArrow('symbol')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('depositApr')}>
                Deposit APR{sortArrow('depositApr')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('borrowApr')}>
                Borrow APR{sortArrow('borrowApr')}
              </th>
              <th>LTV</th>
              <th
                className="cursor-pointer select-none"
                onClick={() => toggleSort('totalDepositsUSD')}
              >
                Total Deposits{sortArrow('totalDepositsUSD')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('totalDebtUSD')}>
                Total Borrows{sortArrow('totalDebtUSD')}
              </th>
              <th
                className="cursor-pointer select-none"
                onClick={() => toggleSort('totalLiquidityUSD')}
              >
                Liquidity{sortArrow('totalLiquidityUSD')}
              </th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {pagedPools.map((pool) => {
              const role = highlightMap.get(pool.marketUid)
              const userPos = userPositions.get(pool.marketUid)
              const hasPosition =
                userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)

              const iy = pool.intrinsicYield ?? 0
              const depositTotal = pool.depositRate + iy
              const borrowTotal = pool.variableBorrowRate + iy

              return (
                <tr
                  key={pool.marketUid}
                  className={`transition-colors ${role ? ROLE_STYLES[role] : ''}`}
                >
                  <td className="max-w-40">
                    <AssetPopover
                      address={pool.underlying}
                      name={pool.asset.name}
                      symbol={pool.asset.symbol}
                      logoURI={pool.asset.logoURI}
                      positionDot={!!hasPosition}
                      marketUid={pool.marketUid}
                      marketName={pool.name}
                      currentUtilization={pool.totalDeposits > 0 ? pool.totalDebt / pool.totalDeposits : undefined}
                      currentDepositRate={depositTotal}
                      currentBorrowRate={borrowTotal}
                      oraclePriceUsd={pool.oraclePriceUSD}
                      chainId={pool.asset.chainId}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-sm truncate" title={pool.asset.symbol}>
                          {pool.asset.symbol}
                          {pool.isFrozen && (
                            <span
                              className="ml-1 text-warning text-xs"
                              title="Deposits &amp; borrows are paused"
                            >
                              &#x2744;
                            </span>
                          )}
                        </span>
                        <span
                          className="text-[11px] text-base-content/60 truncate"
                          title={pool.name}
                        >
                          {pool.name}
                        </span>
                      </div>
                    </AssetPopover>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-success">
                        {depositTotal.toFixed(2)}%
                      </span>
                      {iy > 0 && (
                        <span
                          className="badge badge-xs bg-success/15 text-success border-0 cursor-help"
                          title={`Base rate: ${pool.depositRate.toFixed(2)}% + Intrinsic yield: ${iy.toFixed(2)}%`}
                        >
                          +{iy.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-warning">
                        {borrowTotal.toFixed(2)}%
                      </span>
                      {iy > 0 && (
                        <span
                          className="badge badge-xs bg-warning/15 text-warning border-0 cursor-help"
                          title={`Base rate: ${pool.variableBorrowRate.toFixed(2)}% + Intrinsic yield: ${iy.toFixed(2)}% (paid by borrower)`}
                        >
                          +{iy.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <LtvBadge config={pool.config} variant="cell" />
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-xs" title={`$${formatUsd(pool.totalDepositsUSD)}`}>
                        {abbreviateUsd(pool.totalDepositsUSD)}
                      </span>
                      <span className="text-[10px] text-base-content/50" title={formatTokenAmount(pool.totalDeposits)}>
                        {abbreviateNumber(pool.totalDeposits)} {pool.asset.symbol}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-xs" title={`$${formatUsd(pool.totalDebtUSD)}`}>
                        {abbreviateUsd(pool.totalDebtUSD)}
                      </span>
                      <span className="text-[10px] text-base-content/50" title={formatTokenAmount(pool.totalDebt)}>
                        {abbreviateNumber(pool.totalDebt)} {pool.asset.symbol}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-xs" title={`$${formatUsd(pool.totalLiquidityUSD)}`}>
                        {abbreviateUsd(pool.totalLiquidityUSD)}
                      </span>
                      <span className="text-[10px] text-base-content/50" title={formatTokenAmount(pool.totalLiquidity)}>
                        {abbreviateNumber(pool.totalLiquidity)} {pool.asset.symbol}
                      </span>
                    </div>
                  </td>
                  <td>
                    {pool.risk ? (
                      <RiskBadge label={pool.risk.label} breakdown={pool.risk.breakdown} />
                    ) : (
                      <span className="text-xs text-base-content/40">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {pagedPools.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-6 text-sm text-base-content/60">
                  No pools match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-base-300">
        {pagedPools.length > 0 && (
          <div className="flex gap-1 p-2 overflow-x-auto">
            {(
              ['depositApr', 'borrowApr', 'totalDepositsUSD', 'totalLiquidityUSD'] as SortKey[]
            ).map((key) => {
              const labels: Record<string, string> = {
                depositApr: 'Dep APR',
                borrowApr: 'Bor APR',
                totalDepositsUSD: 'Deposits',
                totalLiquidityUSD: 'Liquidity',
              }
              return (
                <button
                  key={key}
                  type="button"
                  className={`btn btn-xs ${sortKey === key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => toggleSort(key)}
                >
                  {labels[key]}
                  {sortKey === key && (
                    <span className="ml-0.5">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {pagedPools.map((pool) => {
          const role = highlightMap.get(pool.marketUid)
          const userPos = userPositions.get(pool.marketUid)
          const hasPosition = userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
          const mIy = pool.intrinsicYield ?? 0
          const mDepTotal = pool.depositRate + mIy
          const mBorTotal = pool.variableBorrowRate + mIy

          return (
            <div
              key={`m-${pool.marketUid}`}
              className={`p-3 transition-colors ${role ? MOBILE_ROLE_STYLES[role] : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0 flex-1">
                  <AssetPopover
                    address={pool.underlying}
                    name={pool.asset.name}
                    symbol={pool.asset.symbol}
                    logoURI={pool.asset.logoURI}
                    positionDot={!!hasPosition}
                    marketUid={pool.marketUid}
                    marketName={pool.name}
                    currentUtilization={pool.totalDeposits > 0 ? pool.totalDebt / pool.totalDeposits : undefined}
                    currentDepositRate={mDepTotal}
                    currentBorrowRate={mBorTotal}
                    oraclePriceUsd={pool.oraclePriceUSD}
                    chainId={pool.asset.chainId}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm truncate" title={pool.asset.symbol}>
                        {pool.asset.symbol}
                        {pool.isFrozen && <span className="ml-1 text-warning text-xs">&#x2744;</span>}
                      </span>
                      <span
                        className="text-[11px] text-base-content/60 truncate"
                        title={pool.name}
                      >
                        {pool.name}
                      </span>
                    </div>
                  </AssetPopover>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-bold text-sm text-success">{mDepTotal.toFixed(2)}%</span>
                    {mIy > 0 && (
                      <span
                        className="badge badge-xs bg-success/15 text-success border-0"
                        title={`Base rate: ${pool.depositRate.toFixed(2)}% + Intrinsic yield: ${mIy.toFixed(2)}%`}
                      >
                        +{mIy.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-base-content/50 block">Deposit APR</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-base-content/70">
                <span>
                  Borrow: <span className="text-warning font-medium">{mBorTotal.toFixed(2)}%</span>
                  {mIy > 0 && (
                    <span
                      className="badge badge-xs bg-warning/15 text-warning border-0 ml-1"
                      title={`Base rate: ${pool.variableBorrowRate.toFixed(2)}% + Intrinsic yield: ${mIy.toFixed(2)}%`}
                    >
                      +{mIy.toFixed(1)}%
                    </span>
                  )}
                </span>
                <LtvBadge config={pool.config} variant="inline" />
                <span title={`${formatTokenAmount(pool.totalDeposits)} ${pool.asset.symbol}`}>Dep: {abbreviateUsd(pool.totalDepositsUSD)} <span className="text-base-content/40">({abbreviateNumber(pool.totalDeposits)})</span></span>
                <span title={`${formatTokenAmount(pool.totalLiquidity)} ${pool.asset.symbol}`}>Liq: {abbreviateUsd(pool.totalLiquidityUSD)} <span className="text-base-content/40">({abbreviateNumber(pool.totalLiquidity)})</span></span>
                {pool.risk && (
                  <RiskBadge label={pool.risk.label} breakdown={pool.risk.breakdown} size="sm" />
                )}
              </div>
            </div>
          )
        })}
        {pagedPools.length === 0 && (
          <div className="text-center py-6 text-sm text-base-content/60">
            No pools match your search.
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-base-300 text-xs text-base-content/60">
          <span>
            {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              &lsaquo;
            </button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              &rsaquo;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

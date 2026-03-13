import React, { useMemo, useState } from 'react'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import { abbreviateUsd, formatUsd } from '../../../utils/format'
import { sortPools, type SortKey, LtvBadge } from '../Dashboard'
import { AssetPopover } from '../AssetPopover'

const PAGE_SIZE = 25

interface Props {
  pools: PoolDataItem[]
  userPositions: Map<string, UserPositionEntry>
  selectedMarketUid?: string
  onPoolSelect: (pool: PoolDataItem) => void
  assetSearch: string
  onAssetSearchChange: (value: string) => void
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onToggleSort: (key: SortKey) => void
}

export const LendingMarketTable: React.FC<Props> = ({
  pools,
  userPositions,
  selectedMarketUid,
  onPoolSelect,
  assetSearch,
  onAssetSearchChange,
  sortKey,
  sortDir,
  onToggleSort,
}) => {
  const [page, setPage] = useState(0)

  // Reset to first page when search/sort changes
  const poolCount = pools.length
  React.useEffect(() => setPage(0), [assetSearch, sortKey, sortDir, poolCount])

  const totalPages = Math.max(1, Math.ceil(pools.length / PAGE_SIZE))
  const pagedPools = useMemo(
    () => pools.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [pools, page]
  )

  const sortArrow = (key: SortKey) =>
    sortKey === key ? <span className="ml-1 text-xs">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span> : null

  return (
    <div className="rounded-box border border-base-300 overflow-hidden">
      {/* Search + legend */}
      <div className="p-2 border-b border-base-300 flex items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, symbol or address..."
          className="input input-bordered input-sm flex-1"
          value={assetSearch}
          onChange={(e) => onAssetSearchChange(e.target.value)}
        />
        <span
          className="flex items-center gap-1 text-[10px] text-base-content/50 shrink-0"
          title="Deposits &amp; borrows are paused"
        >
          <span className="text-warning text-sm">&#x2744;</span> = Paused
        </span>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th className="cursor-pointer select-none" onClick={() => onToggleSort('symbol')}>
                Asset{sortArrow('symbol')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => onToggleSort('depositApr')}>
                Deposit APR{sortArrow('depositApr')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => onToggleSort('borrowApr')}>
                Borrow APR{sortArrow('borrowApr')}
              </th>
              <th>LTV</th>
              <th
                className="cursor-pointer select-none"
                onClick={() => onToggleSort('totalDepositsUSD')}
              >
                Total Deposits{sortArrow('totalDepositsUSD')}
              </th>
              <th
                className="cursor-pointer select-none"
                onClick={() => onToggleSort('totalDebtUSD')}
              >
                Total Borrows{sortArrow('totalDebtUSD')}
              </th>
              <th
                className="cursor-pointer select-none"
                onClick={() => onToggleSort('totalLiquidityUSD')}
              >
                Liquidity{sortArrow('totalLiquidityUSD')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pagedPools.map((pool) => {
              const isSelected = selectedMarketUid === pool.marketUid
              const userPos = userPositions.get(pool.marketUid)
              const hasPosition =
                userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
              const iy = pool.intrinsicYield ?? 0
              const depositTotal = pool.depositRate + iy
              const borrowTotal = pool.variableBorrowRate + iy

              return (
                <tr
                  key={pool.marketUid}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-base-200'
                  }`}
                  onClick={() => onPoolSelect(pool)}
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
                      currentUtilization={
                        pool.totalDeposits > 0
                          ? pool.totalDebt / pool.totalDeposits
                          : undefined
                      }
                      currentDepositRate={depositTotal}
                      currentBorrowRate={borrowTotal}
                      oraclePriceUsd={pool.oraclePriceUSD}
                      chainId={pool.asset.chainId}
                    >
                      <div className="flex flex-col min-w-0">
                        <span
                          className="font-medium text-sm truncate"
                          title={pool.asset.symbol}
                        >
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
                    <span
                      className="text-xs"
                      title={`$${formatUsd(pool.totalDepositsUSD)}`}
                    >
                      {abbreviateUsd(pool.totalDepositsUSD)}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs" title={`$${formatUsd(pool.totalDebtUSD)}`}>
                      {abbreviateUsd(pool.totalDebtUSD)}
                    </span>
                  </td>
                  <td>
                    <span
                      className="text-xs"
                      title={`$${formatUsd(pool.totalLiquidityUSD)}`}
                    >
                      {abbreviateUsd(pool.totalLiquidityUSD)}
                    </span>
                  </td>
                </tr>
              )
            })}
            {pagedPools.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-6 text-sm text-base-content/60">
                  No pools match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <MobilePoolCards
        pools={pagedPools}
        userPositions={userPositions}
        selectedMarketUid={selectedMarketUid}
        onPoolSelect={onPoolSelect}
        sortKey={sortKey}
        sortDir={sortDir}
        onToggleSort={onToggleSort}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-base-300 text-xs text-base-content/60">
          <span>
            {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, pools.length)} of{' '}
            {pools.length}
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

/* ── Mobile cards (rendered inside the same border container) ── */

const MobilePoolCards: React.FC<{
  pools: PoolDataItem[]
  userPositions: Map<string, UserPositionEntry>
  selectedMarketUid?: string
  onPoolSelect: (pool: PoolDataItem) => void
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onToggleSort: (key: SortKey) => void
}> = ({ pools, userPositions, selectedMarketUid, onPoolSelect, sortKey, sortDir, onToggleSort }) => {
  const sortLabels: Record<string, string> = {
    depositApr: 'Dep APR',
    borrowApr: 'Bor APR',
    totalDepositsUSD: 'Deposits',
    totalLiquidityUSD: 'Liquidity',
  }
  const sortKeys: SortKey[] = ['depositApr', 'borrowApr', 'totalDepositsUSD', 'totalLiquidityUSD']

  return (
    <div className="md:hidden divide-y divide-base-300">
      {pools.length > 0 && (
        <div className="flex gap-1 p-2 overflow-x-auto">
          {sortKeys.map((key) => (
            <button
              key={key}
              type="button"
              className={`btn btn-xs ${sortKey === key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => onToggleSort(key)}
            >
              {sortLabels[key]}
              {sortKey === key && (
                <span className="ml-0.5">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {pools.map((pool) => {
        const isSelected = selectedMarketUid === pool.marketUid
        const userPos = userPositions.get(pool.marketUid)
        const hasPosition =
          userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
        const mIy = pool.intrinsicYield ?? 0
        const mDepTotal = pool.depositRate + mIy
        const mBorTotal = pool.variableBorrowRate + mIy

        return (
          <div
            key={`m-${pool.marketUid}`}
            className={`p-3 cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : 'active:bg-base-200'}`}
            onClick={() => onPoolSelect(pool)}
          >
            <div className="flex items-center justify-between">
              <AssetPopover
                address={pool.underlying}
                name={pool.asset.name}
                symbol={pool.asset.symbol}
                logoURI={pool.asset.logoURI}
                positionDot={!!hasPosition}
                marketUid={pool.marketUid}
                marketName={pool.name}
                currentUtilization={
                  pool.totalDeposits > 0 ? pool.totalDebt / pool.totalDeposits : undefined
                }
                currentDepositRate={mDepTotal}
                currentBorrowRate={mBorTotal}
                oraclePriceUsd={pool.oraclePriceUSD}
                chainId={pool.asset.chainId}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm truncate" title={pool.asset.symbol}>
                    {pool.asset.symbol}
                    {pool.isFrozen && (
                      <span className="ml-1 text-warning text-xs">&#x2744;</span>
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
              <div className="text-right shrink-0">
                <div className="flex items-center justify-end gap-1">
                  <span className="font-bold text-sm text-success">
                    {mDepTotal.toFixed(2)}%
                  </span>
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
                Borrow:{' '}
                <span className="text-warning font-medium">{mBorTotal.toFixed(2)}%</span>
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
              <span>Dep: {abbreviateUsd(pool.totalDepositsUSD)}</span>
              <span>Liq: {abbreviateUsd(pool.totalLiquidityUSD)}</span>
            </div>
          </div>
        )
      })}
      {pools.length === 0 && (
        <div className="text-center py-6 text-sm text-base-content/60">
          No pools match your search.
        </div>
      )}
    </div>
  )
}

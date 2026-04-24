import React from 'react'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import {
  abbreviateUsd,
  abbreviateNumber,
  formatUsd,
  formatTokenAmount,
} from '../../../utils/format'
import { type SortKey, LtvBadge } from '../Dashboard'
import { AssetPopover } from '../AssetPopover'
import { RiskBadge } from '../RiskBadge'
import { useTablePagination } from '../../../hooks/useTablePagination'
import { SortableHeader } from '../../common/SortableHeader'
import { TableEmptyRow } from '../../common/TableEmptyRow'
import { TablePagination } from '../../common/TablePagination'

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
  const pagination = useTablePagination(pools, PAGE_SIZE, [assetSearch, sortKey, sortDir])
  const { pagedItems: pagedPools } = pagination

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
        <table className="table table-sm table-fixed w-full [&_td]:overflow-hidden [&_th]:overflow-hidden">
          <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
            <tr>
              <SortableHeader sortKey="symbol" activeKey={sortKey} activeDir={sortDir} onToggle={onToggleSort} className="w-[18%]">
                Asset
              </SortableHeader>
              <SortableHeader sortKey="depositApr" activeKey={sortKey} activeDir={sortDir} onToggle={onToggleSort} title="Deposit APR" className="w-[11%]">
                Dep APR
              </SortableHeader>
              <SortableHeader sortKey="borrowApr" activeKey={sortKey} activeDir={sortDir} onToggle={onToggleSort} title="Borrow APR" className="w-[11%]">
                Bor APR
              </SortableHeader>
              <th className="w-[10%]">LTV</th>
              <SortableHeader sortKey="totalDepositsUSD" activeKey={sortKey} activeDir={sortDir} onToggle={onToggleSort} title="Total Deposits" className="w-[13%]">
                Deposits
              </SortableHeader>
              <SortableHeader sortKey="totalDebtUSD" activeKey={sortKey} activeDir={sortDir} onToggle={onToggleSort} title="Total Borrows" className="w-[13%]">
                Borrows
              </SortableHeader>
              <SortableHeader sortKey="totalLiquidityUSD" activeKey={sortKey} activeDir={sortDir} onToggle={onToggleSort} title="Liquidity" className="w-[12%]">
                Liq.
              </SortableHeader>
              <th className="w-[12%]">Risk</th>
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
                  <td>
                    <AssetPopover
                      address={pool.underlying}
                      name={pool.asset.name}
                      symbol={pool.asset.symbol}
                      logoURI={pool.asset.logoURI}
                      positionDot={!!hasPosition}
                      marketUid={pool.marketUid}
                      marketName={pool.name}
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
                          className="text-[10px] text-base-content/60 truncate"
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
                      <span
                        className="text-[10px] text-base-content/50"
                        title={formatTokenAmount(pool.totalDeposits)}
                      >
                        {abbreviateNumber(pool.totalDeposits)} {pool.asset.symbol}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-xs" title={`$${formatUsd(pool.totalDebtUSD)}`}>
                        {abbreviateUsd(pool.totalDebtUSD)}
                      </span>
                      <span
                        className="text-[10px] text-base-content/50"
                        title={formatTokenAmount(pool.totalDebt)}
                      >
                        {abbreviateNumber(pool.totalDebt)} {pool.asset.symbol}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span className="text-xs" title={`$${formatUsd(pool.totalLiquidityUSD)}`}>
                        {abbreviateUsd(pool.totalLiquidityUSD)}
                      </span>
                      <span
                        className="text-[10px] text-base-content/50"
                        title={formatTokenAmount(pool.totalLiquidity)}
                      >
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
              <TableEmptyRow colSpan={8}>No pools match your search.</TableEmptyRow>
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
      <TablePagination pagination={pagination} totalItems={pools.length} itemNoun="pools" />
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
}> = ({
  pools,
  userPositions,
  selectedMarketUid,
  onPoolSelect,
  sortKey,
  sortDir,
  onToggleSort,
}) => {
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
        const hasPosition = userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
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
                  <span className="text-[10px] text-base-content/60 truncate" title={pool.name}>
                    {pool.name}
                  </span>
                </div>
              </AssetPopover>
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
              <span title={`${formatTokenAmount(pool.totalDeposits)} ${pool.asset.symbol}`}>
                Dep: {abbreviateUsd(pool.totalDepositsUSD)}{' '}
                <span className="text-base-content/40">
                  ({abbreviateNumber(pool.totalDeposits)})
                </span>
              </span>
              <span title={`${formatTokenAmount(pool.totalLiquidity)} ${pool.asset.symbol}`}>
                Liq: {abbreviateUsd(pool.totalLiquidityUSD)}{' '}
                <span className="text-base-content/40">
                  ({abbreviateNumber(pool.totalLiquidity)})
                </span>
              </span>
              {pool.risk && (
                <RiskBadge label={pool.risk.label} breakdown={pool.risk.breakdown} size="sm" />
              )}
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

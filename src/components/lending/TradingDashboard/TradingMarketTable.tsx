import React, { useMemo, useState } from 'react'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import type { TableHighlight, PoolRole } from './types'
import { abbreviateUsd, abbreviateNumber, formatUsd, formatTokenAmount } from '../../../utils/format'
import { AssetPopover } from '../AssetPopover'
import { sortPools, type SortKey, LtvBadge } from '../Dashboard'
import { RiskBadge } from '../RiskBadge'
import { useTableSort } from '../../../hooks/useTableSort'
import { useTablePagination } from '../../../hooks/useTablePagination'
import { SortableHeader } from '../../common/SortableHeader'
import { TableEmptyRow } from '../../common/TableEmptyRow'
import { TablePagination } from '../../common/TablePagination'

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
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>('totalDepositsUSD')

  const highlightMap = useMemo(() => {
    const map = new Map<string, PoolRole>()
    for (const h of highlights) map.set(h.marketUid, h.role)
    return map
  }, [highlights])

  const sorted = useMemo(
    () => sortPools(pools, search, sortKey, sortDir),
    [pools, search, sortKey, sortDir]
  )

  const pagination = useTablePagination(sorted, PAGE_SIZE, [search, sortKey, sortDir])
  const { pagedItems: pagedPools } = pagination

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
          <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
            <tr>
              <SortableHeader sortKey="symbol" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort}>
                Asset
              </SortableHeader>
              <SortableHeader sortKey="depositApr" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort}>
                Deposit APR
              </SortableHeader>
              <SortableHeader sortKey="borrowApr" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort}>
                Borrow APR
              </SortableHeader>
              <th>LTV</th>
              <SortableHeader sortKey="totalDepositsUSD" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort}>
                Total Deposits
              </SortableHeader>
              <SortableHeader sortKey="totalDebtUSD" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort}>
                Total Borrows
              </SortableHeader>
              <SortableHeader sortKey="totalLiquidityUSD" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort}>
                Liquidity
              </SortableHeader>
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
              <TableEmptyRow colSpan={8}>No pools match your search.</TableEmptyRow>
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
                        className="text-[10px] text-base-content/60 truncate"
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
      <TablePagination pagination={pagination} totalItems={sorted.length} itemNoun="pools" />
    </div>
  )
}

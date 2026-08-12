import React, { useMemo, useState } from 'react'
import type {
  PoolConfigGroup,
  ConfigMarketItem,
  PoolDataItem,
} from '../../../sdk/lending-helper/marketTypes'
import type { UserPositionEntry } from '../../../sdk/lending-helper/userPositionTypes'
import type { PoolRole, PoolSide } from '../tabs/trading/types'
import {
  abbreviateUsd,
  abbreviateNumber,
  formatUsd,
  formatTokenAmount,
} from '../../../utils/format'
import { BrokeredAprCell } from './BrokeredAprCell'
import { useTablePagination } from '../../../hooks/useTablePagination'
import { TablePagination } from '../../common/TablePagination'
import { EmptyState } from '../../common/EmptyState'
import { nextSort } from '../../../hooks/useTableSort'
import { DETAIL_PAGE_SIZE, ROLE_RAIL } from './configMarketConstants'
import { AprCell, AssetCell, RoleChip, SideBadge } from './ConfigMarketCells'

type DetailSide = 'all' | 'collateral' | 'borrowable' | 'supply'
type DetailSortKey = 'side' | 'liquidity' | 'apr' | 'ltv'

interface CombinedDetailTableProps {
  group: PoolConfigGroup
  selectedMarketUid?: string
  userPositions: Map<string, UserPositionEntry>
  highlightMap: Map<string, PoolRole>
  onRowClick: (marketUid: string, side: PoolSide) => void
  poolMap: Map<string, PoolDataItem>
}

/**
 * Map a display side onto the trade-leg side the action panel understands.
 *
 * `supply` is presentation only — it is the same (market, asset) as its
 * borrowable row, shown from the lender's point of view. Selecting it therefore
 * selects that asset, and `PoolSide` deliberately stays two-valued: a lend-only
 * asset can never be a collateral leg, so widening it would let the loop
 * builders be handed a leg the protocol cannot accept.
 */
const toPoolSide = (side: 'collateral' | 'borrowable' | 'supply'): PoolSide =>
  side === 'collateral' ? 'collateral' : 'borrowable'

export interface DetailRow {
  /**
   * `supply` is a DISPLAY side, not a third market role.
   *
   * The table used to assume an asset you can deposit is an asset you can post
   * as collateral. That holds on a pooled lender, where the borrowable is also
   * the supplied asset — but not on a one-sided market. A LlamaLend market
   * borrows crvUSD against sreUSD: crvUSD is lent for yield and can NEVER be
   * collateral, so it appears only in `borrowables` and its supply APR and
   * deposit-side rewards had nowhere to render. Curve shows exactly these as
   * "Net Supply APY" next to "Net Borrow APR"; we had neither.
   */
  side: 'collateral' | 'borrowable' | 'supply'
  item: ConfigMarketItem
}

/**
 * Build the per-(asset, side) rows for one config group.
 *
 * Exported for testing: whether a lend-only asset gets its own supply row is
 * the whole behaviour, and it is invisible from the rendered output when it is
 * wrong — the row simply is not there.
 */
export function buildDetailRows(
  group: Pick<PoolConfigGroup, 'collaterals' | 'borrowables'>,
  poolMap: Map<string, PoolDataItem>
): DetailRow[] {
  const out: DetailRow[] = []
  const collateralUids = new Set((group.collaterals ?? []).map((c) => c.marketUid))
  for (const c of group.collaterals ?? []) out.push({ side: 'collateral', item: c })
  for (const b of group.borrowables ?? []) {
    out.push({ side: 'borrowable', item: b })
    /**
     * A borrowable that is NOT also collateral is a lend-only asset: you can
     * supply it for yield, and that yield is invisible on a borrow row.
     *
     * Gated on the asset being absent from `collaterals` so pooled lenders
     * are untouched — there the same asset sits in both arrays and its
     * collateral row already carries the deposit APR. Gated on there being
     * real deposit economics so a borrow-only market with no supply side
     * (Inverse mints DOLA; nobody lends it) gains no empty row.
     */
    const pool = poolMap.get(b.marketUid)
    const hasSupplySide = (b.depositRate ?? 0) > 0 || (pool?.depositRewardApr ?? 0) > 0
    if (!collateralUids.has(b.marketUid) && hasSupplySide) {
      out.push({ side: 'supply', item: b })
    }
  }
  return out
}

export const CombinedDetailTable: React.FC<CombinedDetailTableProps> = ({
  group,
  selectedMarketUid,
  userPositions,
  highlightMap,
  onRowClick,
  poolMap,
}) => {
  const [side, setSide] = useState<DetailSide>('all')
  const [sortKey, setSortKey] = useState<DetailSortKey>('liquidity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filter, setFilter] = useState('')

  const allRows = useMemo<DetailRow[]>(() => buildDetailRows(group, poolMap), [group, poolMap])

  // Counts come from the ROWS, not from `group.collaterals/borrowables` — the
  // supply rows are derived here, so the raw arrays no longer describe the table.
  const sideCounts = useMemo(() => {
    let collateral = 0
    let borrowable = 0
    let supply = 0
    for (const r of allRows) {
      if (r.side === 'collateral') collateral++
      else if (r.side === 'supply') supply++
      else borrowable++
    }
    return { collateral, borrowable, supply, all: allRows.length }
  }, [allRows])

  const filteredSorted = useMemo(() => {
    let rows = allRows
    if (side !== 'all') rows = rows.filter((r) => r.side === side)

    const q = filter.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) => {
        const a = r.item.underlyingInfo.asset
        return a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
      })
    }

    const valueFor = (r: DetailRow): number => {
      const it = r.item
      const iy = it.intrinsicYield ?? 0
      switch (sortKey) {
        case 'side':
          // Collateral < Supply < Borrowable so 'asc' groups the earn sides first
          return r.side === 'collateral' ? 0 : r.side === 'supply' ? 1 : 2
        case 'liquidity':
          return r.side === 'borrowable'
            ? (it.totalLiquidityUsd ?? it.totalDepositsUsd - it.totalDebtUsd)
            : it.totalDepositsUsd
        case 'apr':
          // A supply row is rated on what it PAYS, not what it costs.
          return r.side === 'borrowable' ? it.variableBorrowRate + iy : it.depositRate + iy
        case 'ltv':
          // Supplying is not collateral, so it has no LTV to sort on.
          return r.side === 'collateral' ? it.borrowCollateralFactor || 0 : 0
      }
    }

    return [...rows].sort((a, b) => {
      const av = valueFor(a)
      const bv = valueFor(b)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [allRows, side, filter, sortKey, sortDir])

  // Pin rows that carry a Loop role to the top — without this, a highlighted
  // row (e.g. the debt-repay output) can sort below the page boundary and be
  // invisible until the user paginates. The pin is stable so the within-pinned
  // and within-unpinned ordering still respects the user's chosen sort.
  const pinnedSorted = useMemo(() => {
    if (highlightMap.size === 0) return filteredSorted
    const pinned: DetailRow[] = []
    const rest: DetailRow[] = []
    for (const r of filteredSorted) {
      if (highlightMap.has(`${r.item.marketUid}|${r.side}`)) pinned.push(r)
      else rest.push(r)
    }
    return [...pinned, ...rest]
  }, [filteredSorted, highlightMap])

  const detailPagination = useTablePagination(pinnedSorted, DETAIL_PAGE_SIZE, [
    side,
    filter,
    sortKey,
    sortDir,
    highlightMap,
  ])
  const { pagedItems: pagedRows, page: detailPage, setPage: setDetailPage } = detailPagination

  // Same problem one level down, and the same fix as the config list: a market
  // selected by a hand-off (Earn → Lending pre-selects the row the user clicked)
  // can sort below the page boundary inside a large config, so the row is
  // selected but invisible. Loop-role highlights solve this by pinning to the
  // top; a selection shouldn't reorder the table under the user, so it pages to
  // the row instead. Aligned once per selection — see the config-list note.
  const alignedMarketRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!selectedMarketUid || pinnedSorted.length === 0) return
    if (alignedMarketRef.current === selectedMarketUid) return
    const idx = pinnedSorted.findIndex((r) => r.item.marketUid === selectedMarketUid)
    if (idx < 0) return
    alignedMarketRef.current = selectedMarketUid
    const target = Math.floor(idx / DETAIL_PAGE_SIZE)
    if (target !== detailPage) setDetailPage(target)
  }, [selectedMarketUid, pinnedSorted, detailPage, setDetailPage])

  const toggleSort = (key: DetailSortKey) => {
    const next = nextSort({ sortKey, sortDir }, key)
    setSortKey(next.sortKey)
    setSortDir(next.sortDir)
  }

  const sortIndicator = (key: DetailSortKey) =>
    sortKey === key ? <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  return (
    <div className="border-t border-base-300">
      {/* Toolbar: side filter + search */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-base-300 bg-base-200/30">
        <div role="tablist" className="tabs tabs-boxed tabs-xs bg-base-100">
          <button
            type="button"
            role="tab"
            className={`tab ${side === 'all' ? 'tab-active' : ''}`}
            onClick={() => setSide('all')}
          >
            All <span className="text-base-content/50 ml-1">{sideCounts.all}</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${side === 'collateral' ? 'tab-active' : ''}`}
            onClick={() => setSide('collateral')}
          >
            Collateral <span className="text-base-content/50 ml-1">{sideCounts.collateral}</span>
          </button>
          {/* Only shown where lending is a distinct role from posting
              collateral — on a pooled lender every supplied asset is already a
              collateral row and this tab would duplicate it. */}
          {sideCounts.supply > 0 && (
            <button
              type="button"
              role="tab"
              className={`tab ${side === 'supply' ? 'tab-active' : ''}`}
              onClick={() => setSide('supply')}
            >
              Lend <span className="text-base-content/50 ml-1">{sideCounts.supply}</span>
            </button>
          )}
          <button
            type="button"
            role="tab"
            className={`tab ${side === 'borrowable' ? 'tab-active' : ''}`}
            onClick={() => setSide('borrowable')}
          >
            Borrowable <span className="text-base-content/50 ml-1">{sideCounts.borrowable}</span>
          </button>
        </div>
        <input
          type="text"
          placeholder="Filter assets…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="input input-xs input-bordered ml-auto w-full sm:w-56 bg-base-100"
        />
      </div>

      {filteredSorted.length === 0 ? (
        <EmptyState size="sm" title="No matches" />
      ) : (
        <>
          {/* Desktop combined table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="table table-sm w-full">
              <thead className="[&_th]:bg-base-100 [&_th]:border-b [&_th]:border-base-300">
                <tr>
                  <th
                    className="w-[7%] cursor-pointer select-none"
                    onClick={() => toggleSort('side')}
                  >
                    Side{sortIndicator('side')}
                  </th>
                  <th className="w-[22%]">Asset</th>
                  <th
                    className="w-[9%] cursor-pointer select-none"
                    onClick={() => toggleSort('apr')}
                  >
                    APR{sortIndicator('apr')}
                  </th>
                  <th
                    className="w-[7%] cursor-pointer select-none text-right"
                    onClick={() => toggleSort('ltv')}
                    title="Loan-to-value (collateral only)"
                  >
                    LTV{sortIndicator('ltv')}
                  </th>
                  <th className="w-[11%] text-right">Deposits</th>
                  <th
                    className="w-[11%] cursor-pointer select-none text-right"
                    onClick={() => toggleSort('liquidity')}
                    title="Borrow liquidity (borrowable) / Deposits (collateral)"
                  >
                    Liquidity{sortIndicator('liquidity')}
                  </th>
                  <th className="w-[11%] text-right">Debt</th>
                  <th
                    className="w-[12%]"
                    title="Loop role: this row's slot in the active loop action"
                  >
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(({ side: rowSide, item }) => {
                  const isSelected = selectedMarketUid === item.marketUid
                  const role = highlightMap.get(`${item.marketUid}|${rowSide}`)
                  const userPos = userPositions.get(item.marketUid)
                  const hasPosition =
                    userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
                  const iy = item.intrinsicYield ?? 0
                  const pool = poolMap.get(item.marketUid)
                  const sym = item.underlyingInfo.asset.symbol
                  const liqUsd = item.totalLiquidityUsd ?? item.totalDepositsUsd - item.totalDebtUsd
                  const liqToken = item.totalLiquidity ?? pool?.totalLiquidity
                  const isBrokered =
                    !!pool &&
                    (pool.variableBorrowDisabled === true || (pool.terms?.length ?? 0) > 0)

                  return (
                    <tr
                      key={`${rowSide}-${item.marketUid}`}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-base-200'
                      } ${role ? ROLE_RAIL[role] : ''}`}
                      onClick={() => onRowClick(item.marketUid, toPoolSide(rowSide))}
                    >
                      <td>
                        <SideBadge side={rowSide} />
                      </td>
                      <td className="max-w-36">
                        <AssetCell
                          item={item}
                          hasPosition={!!hasPosition}
                          entityName={pool?.name}
                        />
                      </td>
                      <td>
                        {rowSide !== 'borrowable' ? (
                          // Collateral and supply rows both show what the asset
                          // PAYS, with the deposit-side reward attached.
                          <AprCell
                            rate={item.depositRate}
                            iy={iy}
                            color="success"
                            reward={pool?.depositRewardApr}
                          />
                        ) : isBrokered ? (
                          <BrokeredAprCell terms={pool?.terms} />
                        ) : (
                          <AprCell
                            rate={item.variableBorrowRate}
                            iy={iy}
                            color="warning"
                            reward={pool?.borrowRewardApr}
                          />
                        )}
                      </td>
                      <td className="text-right">
                        {rowSide === 'collateral' ? (
                          <span className="text-xs font-medium tabular-nums">
                            {(item.borrowCollateralFactor * 100).toFixed(0)}%
                          </span>
                        ) : (
                          // A supplied asset backs nothing, so it has no LTV —
                          // same as a borrowable.
                          <span className="text-xs text-base-content/30">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex flex-col items-end">
                          <span
                            className="text-xs tabular-nums"
                            title={`$${formatUsd(item.totalDepositsUsd)}`}
                          >
                            {abbreviateUsd(item.totalDepositsUsd)}
                          </span>
                          {pool && (
                            <span
                              className="text-[10px] text-base-content/50 tabular-nums"
                              title={formatTokenAmount(pool.totalDeposits)}
                            >
                              {abbreviateNumber(pool.totalDeposits)} {sym}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-xs tabular-nums" title={`$${formatUsd(liqUsd)}`}>
                            {abbreviateUsd(liqUsd)}
                          </span>
                          {liqToken != null && (
                            <span
                              className="text-[10px] text-base-content/50 tabular-nums"
                              title={formatTokenAmount(liqToken)}
                            >
                              {abbreviateNumber(liqToken)} {sym}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex flex-col items-end">
                          <span
                            className="text-xs tabular-nums"
                            title={`$${formatUsd(item.totalDebtUsd)}`}
                          >
                            {abbreviateUsd(item.totalDebtUsd)}
                          </span>
                          {pool && (
                            <span
                              className="text-[10px] text-base-content/50 tabular-nums"
                              title={formatTokenAmount(pool.totalDebt)}
                            >
                              {abbreviateNumber(pool.totalDebt)} {sym}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <RoleChip role={role} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-base-300">
            {pagedRows.map(({ side: rowSide, item }) => {
              const isSelected = selectedMarketUid === item.marketUid
              const role = highlightMap.get(`${item.marketUid}|${rowSide}`)
              const userPos = userPositions.get(item.marketUid)
              const hasPosition =
                userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
              const iy = item.intrinsicYield ?? 0
              const pool = poolMap.get(item.marketUid)
              const sym = item.underlyingInfo.asset.symbol
              const liqUsd = item.totalLiquidityUsd ?? item.totalDepositsUsd - item.totalDebtUsd
              const liqToken = item.totalLiquidity ?? pool?.totalLiquidity
              const isBrokered =
                !!pool && (pool.variableBorrowDisabled === true || (pool.terms?.length ?? 0) > 0)

              return (
                <div
                  key={`m-${rowSide}-${item.marketUid}`}
                  className={`p-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10' : 'active:bg-base-200'
                  } ${role ? ROLE_RAIL[role] : ''}`}
                  onClick={() => onRowClick(item.marketUid, toPoolSide(rowSide))}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <SideBadge side={rowSide} />
                      <AssetCell item={item} hasPosition={!!hasPosition} entityName={pool?.name} />
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      {role && <RoleChip role={role} />}
                      {rowSide !== 'borrowable' ? (
                        <>
                          <AprCell
                            rate={item.depositRate}
                            iy={iy}
                            color="success"
                            reward={pool?.depositRewardApr}
                            align="end"
                          />
                          <span className="text-[10px] text-base-content/50 block">
                            {rowSide === 'supply' ? 'Supply APR' : 'Deposit APR'}
                          </span>
                        </>
                      ) : isBrokered ? (
                        <>
                          <BrokeredAprCell terms={pool?.terms} />
                          <span className="text-[10px] text-base-content/50 block">Fixed-term</span>
                        </>
                      ) : (
                        <>
                          <AprCell
                            rate={item.variableBorrowRate}
                            iy={iy}
                            color="warning"
                            reward={pool?.borrowRewardApr}
                            align="end"
                          />
                          <span className="text-[10px] text-base-content/50 block">Borrow APR</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                    {rowSide === 'collateral' ? (
                      <div className="flex justify-between">
                        <span className="text-base-content/50">LTV</span>
                        <span className="font-medium tabular-nums">
                          {(item.borrowCollateralFactor * 100).toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span className="text-base-content/50">Liquidity</span>
                        <span
                          className="font-medium tabular-nums truncate"
                          title={
                            liqToken != null ? `${formatTokenAmount(liqToken)} ${sym}` : undefined
                          }
                        >
                          {abbreviateUsd(liqUsd)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-base-content/50">
                        {rowSide === 'collateral' ? 'Deposits' : 'Debt'}
                      </span>
                      <span
                        className="font-medium tabular-nums truncate"
                        title={
                          pool
                            ? `${formatTokenAmount(
                                rowSide === 'collateral' ? pool.totalDeposits : pool.totalDebt
                              )} ${sym}`
                            : undefined
                        }
                      >
                        {abbreviateUsd(
                          rowSide === 'collateral' ? item.totalDepositsUsd : item.totalDebtUsd
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <TablePagination
            pagination={detailPagination}
            totalItems={filteredSorted.length}
            itemNoun="markets"
          />
        </>
      )}
    </div>
  )
}

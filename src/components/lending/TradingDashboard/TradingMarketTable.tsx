import React, { useMemo, useState } from 'react'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import type { TableHighlight, PoolRole } from './types'

interface Props {
  pools: PoolDataItem[]
  userPositions: Map<string, UserPositionEntry>
  highlights: TableHighlight[]
}

function abbreviateUsd(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '$0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(2)}`
}

function formatUsd(v: number) {
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1000 ? 2 : 0 })
}

const ROLE_STYLES: Record<PoolRole, string> = {
  input: 'bg-error/10 border-l-2 border-l-error',
  output: 'bg-success/10 border-l-2 border-l-success',
  pay: 'bg-warning/10 border-l-2 border-l-warning',
}

type SortKey = 'symbol' | 'depositApr' | 'borrowApr' | 'totalDepositsUSD' | 'totalDebtUSD' | 'totalLiquidityUSD'

export const TradingMarketTable: React.FC<Props> = ({ pools, userPositions, highlights }) => {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('totalDepositsUSD')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const highlightMap = useMemo(() => {
    const map = new Map<string, PoolRole>()
    for (const h of highlights) map.set(h.poolId, h.role)
    return map
  }, [highlights])

  const sorted = useMemo(() => {
    let result = pools

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.asset.symbol.toLowerCase().includes(q) ||
          p.asset.name.toLowerCase().includes(q) ||
          p.asset.address.toLowerCase().includes(q)
      )
    }

    return [...result].sort((a, b) => {
      let aVal: number | string
      let bVal: number | string
      switch (sortKey) {
        case 'symbol':
          aVal = a.asset.symbol.toLowerCase()
          bVal = b.asset.symbol.toLowerCase()
          break
        case 'depositApr':
          aVal = a.depositRate
          bVal = b.depositRate
          break
        case 'borrowApr':
          aVal = a.variableBorrowRate
          bVal = b.variableBorrowRate
          break
        case 'totalDepositsUSD':
          aVal = a.totalDepositsUSD
          bVal = b.totalDepositsUSD
          break
        case 'totalDebtUSD':
          aVal = a.totalDebtUSD
          bVal = b.totalDebtUSD
          break
        case 'totalLiquidityUSD':
          aVal = a.totalLiquidityUSD
          bVal = b.totalLiquidityUSD
          break
        default:
          aVal = 0
          bVal = 0
      }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [pools, search, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortArrow = (key: SortKey) =>
    sortKey === key ? <span className="ml-1 text-xs">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span> : null

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
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-error inline-block" />In</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" />Out</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning inline-block" />Pay</span>
              <span className="mx-0.5">|</span>
            </>
          )}
          <span className="flex items-center gap-1" title="Deposits &amp; borrows are paused">
            <span className="text-warning text-sm">&#x2744;</span>Paused
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
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
              <th className="cursor-pointer select-none" onClick={() => toggleSort('totalDepositsUSD')}>
                Total Deposits{sortArrow('totalDepositsUSD')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('totalDebtUSD')}>
                Total Borrows{sortArrow('totalDebtUSD')}
              </th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('totalLiquidityUSD')}>
                Liquidity{sortArrow('totalLiquidityUSD')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((pool) => {
              const role = highlightMap.get(pool.poolId)
              const userPos = userPositions.get(pool.underlying.toLowerCase())
              const hasPosition = userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)

              return (
                <tr
                  key={pool.poolId}
                  className={`transition-colors ${role ? ROLE_STYLES[role] : ''}`}
                >
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="relative shrink-0 w-7 h-7">
                        <img
                          src={pool.asset.logoURI}
                          width={28}
                          height={28}
                          alt={pool.asset.symbol}
                          className="rounded-full object-cover w-7 h-7"
                        />
                        {hasPosition && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-base-100"
                            title="You have a position"
                          />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {pool.asset.symbol}
                          {pool.isFrozen && <span className="ml-1 text-warning text-xs" title="Deposits &amp; borrows are paused">&#x2744;</span>}
                        </span>
                        <span className="text-xs text-base-content/60">{pool.asset.name}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="text-sm font-medium text-success">{pool.depositRate.toFixed(2)}%</span>
                  </td>
                  <td>
                    <span className="text-sm font-medium text-warning">{pool.variableBorrowRate.toFixed(2)}%</span>
                  </td>
                  <td>
                    <span className="text-xs" title={`$${formatUsd(pool.totalDepositsUSD)}`}>{abbreviateUsd(pool.totalDepositsUSD)}</span>
                  </td>
                  <td>
                    <span className="text-xs" title={`$${formatUsd(pool.totalDebtUSD)}`}>{abbreviateUsd(pool.totalDebtUSD)}</span>
                  </td>
                  <td>
                    <span className="text-xs" title={`$${formatUsd(pool.totalLiquidityUSD)}`}>{abbreviateUsd(pool.totalLiquidityUSD)}</span>
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-sm text-base-content/60">
                  No pools match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

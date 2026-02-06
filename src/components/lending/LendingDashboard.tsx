import React, { useMemo, useState } from 'react'
import { lenderDisplayNameFull } from '@1delta/lib-utils'
import type { LenderData, PoolDataItem } from '../../hooks/lending/usePoolData'
import type { UserDataResult, UserPositionEntry } from '../../hooks/lending/useUserData'
import {
  DepositAction,
  WithdrawAction,
  BorrowAction,
  RepayAction,
  type ActionType,
} from './DashboardActions'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'

interface Props {
  lenderData: LenderData | undefined
  userData: UserDataResult
  chainId: string
  account?: string
  isLoading: boolean
}

function formatUsd(v: number) {
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString(undefined, {
    maximumFractionDigits: v < 1000 ? 2 : 0,
  })
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

function formatTokenAmount(v: number | string): string {
  const num = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(num) || num === 0) return '0'
  if (num < 0.0001) return '<0.0001'
  if (num < 1) return num.toFixed(6)
  if (num < 1000) return num.toFixed(4)
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

type SortKey = 'symbol' | 'depositApr' | 'borrowApr' | 'totalDepositsUSD' | 'totalDebtUSD' | 'totalLiquidityUSD'

export function LendingDashboard({ lenderData, userData, chainId, account, isLoading }: Props) {
  // Lender selection
  const allLenderKeys = useMemo(
    () => Object.keys(lenderData?.[chainId]?.data ?? {}),
    [lenderData, chainId]
  )

  const [selectedLender, setSelectedLender] = useState<string>('')
  const [selectedPool, setSelectedPool] = useState<PoolDataItem | null>(null)
  const [actionTab, setActionTab] = useState<ActionType>('Deposit')

  // Search & sort state
  const [assetSearch, setAssetSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('totalDepositsUSD')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Per-lender user balance (deposits USD) for sorting & markers
  const lenderBalances = useMemo(() => {
    const map = new Map<string, number>()
    if (!userData.raw) return map
    const chainData = userData.raw[chainId]
    if (!chainData) return map
    for (const [lender, entry] of Object.entries(chainData)) {
      let total = 0
      for (const sub of entry.data) {
        total += sub.balanceData.deposits + sub.balanceData.debt
      }
      if (total > 0) map.set(lender, total)
    }
    return map
  }, [userData, chainId])

  // Lenders sorted: those with balance first (by balance desc), then the rest alphabetically
  const lenders = useMemo(() => {
    return [...allLenderKeys].sort((a, b) => {
      const balA = lenderBalances.get(a) ?? 0
      const balB = lenderBalances.get(b) ?? 0
      if (balA > 0 && balB > 0) return balB - balA
      if (balA > 0) return -1
      if (balB > 0) return 1
      return lenderDisplayNameFull(a).localeCompare(lenderDisplayNameFull(b))
    })
  }, [allLenderKeys, lenderBalances])

  // Lender options for searchable dropdown (no useMemo — display names may resolve lazily)
  const lenderOptions: SearchableSelectOption[] = lenders.map((l) => ({
    value: l,
    label: lenderDisplayNameFull(l),
    indicator: lenderBalances.has(l) ? '\u25CF ' : undefined,
  }))

  // Auto-select first lender (sorted list already prefers highest balance)
  React.useEffect(() => {
    if (lenders.length > 0 && !lenders.includes(selectedLender)) {
      setSelectedLender(lenders[0])
    }
  }, [lenders, selectedLender])

  // All pools for selected lender
  const allPools = useMemo(() => {
    if (!selectedLender || !lenderData) return []
    const poolMap = lenderData[chainId]?.data?.[selectedLender]?.data ?? {}
    return Object.values(poolMap).filter((p) => p.isActive)
  }, [lenderData, chainId, selectedLender])

  // Filtered & sorted pools
  const pools = useMemo(() => {
    let result = allPools

    // Search filter
    if (assetSearch.trim()) {
      const q = assetSearch.toLowerCase()
      result = result.filter((p) =>
        p.asset.symbol.toLowerCase().includes(q) ||
        p.asset.name.toLowerCase().includes(q) ||
        p.asset.address.toLowerCase().includes(q)
      )
    }

    // Sort
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
  }, [allPools, assetSearch, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // User positions for selected lender
  const userPositions = useMemo(() => {
    if (!selectedLender || !userData.raw) return new Map<string, UserPositionEntry>()
    const entry = userData.raw[chainId]?.[selectedLender]
    if (!entry) return new Map<string, UserPositionEntry>()

    const map = new Map<string, UserPositionEntry>()
    for (const sub of entry.data) {
      for (const pos of sub.positions) {
        if (typeof pos === 'object' && pos !== null) {
          map.set(pos.underlying.toLowerCase(), pos)
        }
      }
    }
    return map
  }, [userData, chainId, selectedLender])

  // Lender-level balance summary
  const lenderSummary = useMemo(() => {
    if (!selectedLender || !userData.raw) return null
    const entry = userData.raw[chainId]?.[selectedLender]
    if (!entry) return null

    let deposits = 0
    let debt = 0
    let nav = 0
    let health: number | null = null

    for (const sub of entry.data) {
      deposits += sub.balanceData.deposits
      debt += sub.balanceData.debt
      nav += sub.balanceData.nav
      if (sub.health != null) {
        health = health == null ? sub.health : Math.min(health, sub.health)
      }
    }

    if (deposits === 0 && debt === 0) return null
    return { deposits, debt, nav, health }
  }, [userData, chainId, selectedLender])

  // Active user positions (non-zero deposits or debt) matched with pool data
  const activePositions = useMemo(() => {
    const result: { position: UserPositionEntry; pool: PoolDataItem }[] = []
    for (const pool of allPools) {
      const pos = userPositions.get(pool.underlying.toLowerCase())
      if (pos && (Number(pos.deposits) > 0 || Number(pos.debt) > 0)) {
        result.push({ position: pos, pool })
      }
    }
    return result
  }, [allPools, userPositions])

  // Handle market row click - toggles asset selection
  const handlePoolSelect = (pool: PoolDataItem) => {
    setSelectedPool((prev) => (prev?.poolId === pool.poolId ? null : pool))
  }

  // Handle lender change
  const handleLenderChange = (lender: string) => {
    setSelectedLender(lender)
    setSelectedPool(null)
  }

  // User position for the currently selected pool (passed to action sub-components)
  const selectedPoolUserPos = useMemo(() => {
    if (!selectedPool) return null
    return userPositions.get(selectedPool.underlying.toLowerCase()) ?? null
  }, [selectedPool, userPositions])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Lender selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Lender:</label>
        <SearchableSelect
          options={lenderOptions}
          value={selectedLender}
          onChange={handleLenderChange}
          placeholder="Search lenders..."
        />
        {lenderBalances.size > 0 && (
          <span className="text-xs text-base-content/50">{'\u25CF'} = has balance</span>
        )}
      </div>

      {/* User balances for selected lender */}
      {account && lenderSummary && (
        <div className="rounded-box border border-base-300 p-4 space-y-3">
          {/* Summary stats */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold">Your Positions</h3>
            <div className="flex gap-4 items-center text-xs">
              <span>
                Deposits: <span className="font-semibold text-success">${formatUsd(lenderSummary.deposits)}</span>
              </span>
              <span>
                Debt: <span className="font-semibold text-error">${formatUsd(lenderSummary.debt)}</span>
              </span>
              <span>
                Net: <span className="font-semibold">${formatUsd(lenderSummary.nav)}</span>
              </span>
              {lenderSummary.health != null && (
                <div className="flex items-center gap-1">
                  <span>Health:</span>
                  <span
                    className={`badge badge-sm font-semibold ${
                      lenderSummary.health < 1.1
                        ? 'badge-error'
                        : lenderSummary.health < 1.3
                          ? 'badge-warning'
                          : 'badge-success'
                    }`}
                  >
                    {lenderSummary.health.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Individual token positions */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {activePositions.map(({ position, pool }) => (
              <div
                key={position.poolId}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                  selectedPool?.poolId === pool.poolId
                    ? 'bg-primary/15 ring-1 ring-primary'
                    : 'bg-base-200/50 hover:bg-base-200'
                }`}
                onClick={() => handlePoolSelect(pool)}
              >
                <img
                  src={pool.asset.logoURI}
                  width={32}
                  height={32}
                  alt={pool.asset.symbol}
                  className="rounded-full object-cover w-8 h-8 shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium">{pool.asset.symbol}</span>
                  {Number(position.deposits) > 0 && (
                    <span className="text-xs text-success truncate">
                      +{formatTokenAmount(position.deposits)} (${formatUsd(position.depositsUSD)})
                    </span>
                  )}
                  {Number(position.debt) > 0 && (
                    <span className="text-xs text-error truncate">
                      -{formatTokenAmount(position.debt)} (${formatUsd(position.debtUSD)})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two column layout: Markets + Action Panel */}
      <div className="flex gap-4 items-start">
        {/* Left: Market data table */}
        <div className="flex-1 rounded-box border border-base-300 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-base-300">
            <input
              type="text"
              placeholder="Search by name, symbol or address..."
              className="input input-bordered input-sm w-full"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="table table-sm w-full">
              <thead>
                <tr>
                  <th className="cursor-pointer select-none" onClick={() => toggleSort('symbol')}>
                    Asset
                    {sortKey === 'symbol' && <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th className="cursor-pointer select-none" onClick={() => toggleSort('depositApr')}>
                    Deposit APR
                    {sortKey === 'depositApr' && <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th className="cursor-pointer select-none" onClick={() => toggleSort('borrowApr')}>
                    Borrow APR
                    {sortKey === 'borrowApr' && <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th className="cursor-pointer select-none" onClick={() => toggleSort('totalDepositsUSD')}>
                    Total Deposits
                    {sortKey === 'totalDepositsUSD' && <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th className="cursor-pointer select-none" onClick={() => toggleSort('totalDebtUSD')}>
                    Total Borrows
                    {sortKey === 'totalDebtUSD' && <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th className="cursor-pointer select-none" onClick={() => toggleSort('totalLiquidityUSD')}>
                    Liquidity
                    {sortKey === 'totalLiquidityUSD' && <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pools.map((pool) => {
                  const isSelected = selectedPool?.poolId === pool.poolId
                  const userPos = userPositions.get(pool.underlying.toLowerCase())
                  const hasPosition = userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
                  const depositApr = pool.depositRate.toFixed(2)
                  const borrowApr = pool.variableBorrowRate.toFixed(2)

                  return (
                    <tr
                      key={pool.poolId}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/10'
                          : 'hover:bg-base-200'
                      }`}
                      onClick={() => handlePoolSelect(pool)}
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
                            <span className="font-medium text-sm">{pool.asset.symbol}</span>
                            <span className="text-xs text-base-content/60">{pool.asset.name}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="text-sm font-medium text-success">{depositApr}%</span>
                      </td>
                      <td>
                        <span className="text-sm font-medium text-warning">{borrowApr}%</span>
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
                {pools.length === 0 && (
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

        {/* Right: Action panel */}
        <div className="w-72 shrink-0 rounded-box border border-base-300 p-3 space-y-3 sticky top-4">
          {/* Operation tabs */}
          <div role="tablist" className="tabs tabs-boxed tabs-xs">
            {(['Deposit', 'Withdraw', 'Borrow', 'Repay'] as ActionType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                className={`tab ${actionTab === t ? 'tab-active' : ''}`}
                onClick={() => setActionTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Selected asset display */}
          {selectedPool ? (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200">
              <img
                src={selectedPool.asset.logoURI}
                width={32}
                height={32}
                alt={selectedPool.asset.symbol}
                className="rounded-full object-cover w-8 h-8 shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm">{selectedPool.asset.symbol}</span>
                <span className="text-xs text-base-content/60 truncate">{selectedPool.asset.name}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-base-content/60 text-center p-3 rounded-lg border border-dashed border-base-300">
              Select an asset from the market table
            </div>
          )}

          {/* Action sub-component */}
          {actionTab === 'Deposit' && (
            <DepositAction pool={selectedPool} userPosition={selectedPoolUserPos} lender={selectedLender} chainId={chainId} account={account} />
          )}
          {actionTab === 'Withdraw' && (
            <WithdrawAction pool={selectedPool} userPosition={selectedPoolUserPos} lender={selectedLender} chainId={chainId} account={account} />
          )}
          {actionTab === 'Borrow' && (
            <BorrowAction pool={selectedPool} userPosition={selectedPoolUserPos} lender={selectedLender} chainId={chainId} account={account} />
          )}
          {actionTab === 'Repay' && (
            <RepayAction pool={selectedPool} userPosition={selectedPoolUserPos} lender={selectedLender} chainId={chainId} account={account} />
          )}
        </div>
      </div>
    </div>
  )
}

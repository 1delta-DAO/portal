import React, { useMemo, useState } from 'react'
import { lenderDisplayNameFull } from '@1delta/lib-utils'
import type { LenderData, PoolDataItem } from '../../hooks/lending/usePoolData'
import type { UserDataResult, UserPositionEntry, UserSubAccount } from '../../hooks/lending/useUserData'
import { useTokenBalances } from '../../hooks/lending/useTokenBalances'
import { useSyncChain } from '../../hooks/useSyncChain'
import {
  DepositAction,
  WithdrawAction,
  BorrowAction,
  RepayAction,
  type ActionType,
} from './DashboardActions'
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect'
import { WalletConnect } from '../connect'
import { formatUsd, abbreviateUsd, formatTokenAmount, computeLenderTvl } from '../../utils/format'

interface Props {
  lenderData: LenderData | undefined
  userData: UserDataResult
  chainId: string
  account?: string
  isPublicDataLoading: boolean
  isUserDataLoading: boolean
}

type SortKey = 'symbol' | 'depositApr' | 'borrowApr' | 'totalDepositsUSD' | 'totalDebtUSD' | 'totalLiquidityUSD'

export function LendingDashboard({ lenderData, userData, chainId, account, isPublicDataLoading, isUserDataLoading }: Props) {
  const { syncChain, currentChainId } = useSyncChain()
  const isWrongChain = !!account && currentChainId !== Number(chainId)

  // Lender selection
  const allLenderKeys = useMemo(
    () => Object.keys(lenderData ?? {}),
    [lenderData]
  )

  const [selectedLender, setSelectedLender] = useState<string>('')
  const [selectedSubAccountId, setSelectedSubAccountId] = useState<string | null>(null)
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
    for (const entry of userData.raw) {
      if (entry.chainId !== chainId) continue
      const total = entry.totalDepositsUSD + entry.totalDebtUSD
      if (total > 0) map.set(entry.lender, total)
    }
    return map
  }, [userData, chainId])

  // Lenders sorted: those with balance first (by balance desc), then the rest by TVL desc
  const lenders = useMemo(() => {
    return [...allLenderKeys].sort((a, b) => {
      const balA = lenderBalances.get(a) ?? 0
      const balB = lenderBalances.get(b) ?? 0
      if (balA > 0 && balB > 0) return balB - balA
      if (balA > 0) return -1
      if (balB > 0) return 1
      return computeLenderTvl(lenderData?.[b] ?? []) - computeLenderTvl(lenderData?.[a] ?? [])
    })
  }, [allLenderKeys, lenderBalances, lenderData])

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

  // Sub-accounts for the selected lender
  const subAccounts: UserSubAccount[] = useMemo(() => {
    if (!selectedLender || !userData.raw) return []
    const entry = userData.raw.find(e => e.chainId === chainId && e.lender === selectedLender)
    return entry?.data ?? []
  }, [userData, chainId, selectedLender])

  // Auto-select first sub-account when lender or sub-accounts change
  React.useEffect(() => {
    if (subAccounts.length > 0) {
      setSelectedSubAccountId(subAccounts[0].accountId)
    } else {
      setSelectedSubAccountId(null)
    }
  }, [subAccounts])

  // The currently active sub-account (or null)
  const activeSubAccount = useMemo(
    () => subAccounts.find(s => s.accountId === selectedSubAccountId) ?? null,
    [subAccounts, selectedSubAccountId]
  )

  // All pools for selected lender
  const allPools = useMemo(() => {
    if (!selectedLender || !lenderData) return []
    return lenderData[selectedLender] ?? []
  }, [lenderData, selectedLender])

  // Unique asset addresses for the current lender's pools
  const poolAssetAddresses = useMemo(
    () => [...new Set(allPools.map((p) => p.underlying))],
    [allPools]
  )

  // Wallet token balances for these assets
  const { balances: walletBalances } = useTokenBalances({
    chainId,
    account,
    assets: poolAssetAddresses,
  })

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

  // User positions scoped to the selected sub-account, keyed by marketUid
  const userPositions = useMemo(() => {
    const map = new Map<string, UserPositionEntry>()
    if (!activeSubAccount) return map
    for (const pos of activeSubAccount.positions) {
      if (typeof pos === 'object' && pos !== null) {
        map.set(pos.marketUid, pos)
      }
    }
    return map
  }, [activeSubAccount])

  // Balance summary scoped to selected sub-account
  const lenderSummary = useMemo(() => {
    if (!activeSubAccount) return null
    const bd = activeSubAccount.balanceData
    if (bd.deposits === 0 && bd.debt === 0) return null

    return {
      deposits: bd.deposits,
      debt: bd.debt,
      nav: bd.nav,
      health: activeSubAccount.health,
    }
  }, [activeSubAccount])

  // Active user positions (non-zero deposits or debt) matched with pool data
  const activePositions = useMemo(() => {
    const result: { position: UserPositionEntry; pool: PoolDataItem }[] = []
    for (const pool of allPools) {
      const pos = userPositions.get(pool.marketUid)
      if (pos && (Number(pos.deposits) > 0 || Number(pos.debt) > 0)) {
        result.push({ position: pos, pool })
      }
    }
    return result
  }, [allPools, userPositions])

  // Handle market row click - toggles asset selection
  const handlePoolSelect = (pool: PoolDataItem) => {
    setSelectedPool((prev) => (prev?.marketUid === pool.marketUid ? null : pool))
  }

  // Handle lender change
  const handleLenderChange = (lender: string) => {
    setSelectedLender(lender)
    setSelectedSubAccountId(null)
    setSelectedPool(null)
  }

  // User position for the currently selected pool (passed to action sub-components)
  const selectedPoolUserPos = useMemo(() => {
    if (!selectedPool) return null
    return userPositions.get(selectedPool.marketUid) ?? null
  }, [selectedPool, userPositions])

  // Wallet balance for the currently selected pool's asset
  const selectedPoolWalletBal = useMemo(() => {
    if (!selectedPool) return null
    return walletBalances.get(selectedPool.underlying.toLowerCase()) ?? null
  }, [selectedPool, walletBalances])

  if (isPublicDataLoading) {
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

      {/* User positions grouped by sub-account */}
      {account && isUserDataLoading && (
        <div className="rounded-box border border-base-300 p-4 flex items-center gap-2">
          <span className="loading loading-spinner loading-sm" />
          <span className="text-sm text-base-content/60">Loading positions...</span>
        </div>
      )}
      {account && !isUserDataLoading && subAccounts.length > 0 && (
        <div className="rounded-box border border-base-300 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Your Positions</h3>

          {/* Sub-account chips */}
          <div className="flex flex-wrap gap-2">
            {subAccounts.map((sub, i) => {
              const isActive = sub.accountId === selectedSubAccountId
              const healthBadge = sub.health != null
                ? sub.health < 1.1 ? 'badge-error' : sub.health < 1.3 ? 'badge-warning' : 'badge-success'
                : null

              return (
                <button
                  key={sub.accountId}
                  type="button"
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border ${
                    isActive
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-base-300 bg-base-200/50 hover:bg-base-200'
                  }`}
                  onClick={() => setSelectedSubAccountId(sub.accountId)}
                >
                  <span className="font-semibold">#{i + 1}</span>
                  <span className="text-base-content/70">
                    NAV: <span className="font-medium">{abbreviateUsd(sub.balanceData.nav)}</span>
                  </span>
                  {healthBadge && (
                    <span className={`badge badge-xs font-semibold ${healthBadge}`}>
                      {sub.health!.toFixed(2)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Summary stats for selected sub-account */}
          {lenderSummary && (
            <div className="flex gap-4 items-center text-xs flex-wrap">
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
          )}

          {/* Position cards for the selected sub-account */}
          {activePositions.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {activePositions.map(({ position, pool }) => (
                <div
                  key={pool.marketUid}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedPool?.marketUid === pool.marketUid
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
          )}
        </div>
      )}

      {/* Two column layout: Markets + Action Panel */}
      <div className="flex gap-4 items-start">
        {/* Left: Market data table */}
        <div className="flex-1 rounded-box border border-base-300 overflow-hidden">
          {/* Search + legend */}
          <div className="p-2 border-b border-base-300 flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by name, symbol or address..."
              className="input input-bordered input-sm flex-1"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
            />
            <span className="flex items-center gap-1 text-[10px] text-base-content/50 shrink-0" title="Deposits &amp; borrows are paused">
              <span className="text-warning text-sm">&#x2744;</span> = Paused
            </span>
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
                  const isSelected = selectedPool?.marketUid === pool.marketUid
                  const userPos = userPositions.get(pool.marketUid)
                  const hasPosition = userPos && (Number(userPos.deposits) > 0 || Number(userPos.debt) > 0)
                  const depositApr = pool.depositRate.toFixed(2)
                  const borrowApr = pool.variableBorrowRate.toFixed(2)

                  return (
                    <tr
                      key={pool.marketUid}
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
                            <span className="font-medium text-sm">
                              {pool.asset.symbol}
                              {pool.isFrozen && <span className="ml-1 text-warning text-xs" title="Deposits &amp; borrows are paused">&#x2744;</span>}
                            </span>
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

          {/* Action sub-component — gated by wallet connection & chain */}
          {!account ? (
            <div className="w-full flex justify-center">
              <WalletConnect />
            </div>
          ) : isWrongChain ? (
            <button
              type="button"
              className="btn btn-warning btn-sm w-full"
              onClick={() => syncChain(Number(chainId))}
            >
              Switch Wallet Chain
            </button>
          ) : (
            <>
              {actionTab === 'Deposit' && (
                <DepositAction pool={selectedPool} userPosition={selectedPoolUserPos} walletBalance={selectedPoolWalletBal} lender={selectedLender} chainId={chainId} account={account} accountId={selectedSubAccountId ?? undefined} />
              )}
              {actionTab === 'Withdraw' && (
                <WithdrawAction pool={selectedPool} userPosition={selectedPoolUserPos} walletBalance={selectedPoolWalletBal} lender={selectedLender} chainId={chainId} account={account} accountId={selectedSubAccountId ?? undefined} />
              )}
              {actionTab === 'Borrow' && (
                <BorrowAction pool={selectedPool} userPosition={selectedPoolUserPos} walletBalance={selectedPoolWalletBal} lender={selectedLender} chainId={chainId} account={account} accountId={selectedSubAccountId ?? undefined} />
              )}
              {actionTab === 'Repay' && (
                <RepayAction pool={selectedPool} userPosition={selectedPoolUserPos} walletBalance={selectedPoolWalletBal} lender={selectedLender} chainId={chainId} account={account} accountId={selectedSubAccountId ?? undefined} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

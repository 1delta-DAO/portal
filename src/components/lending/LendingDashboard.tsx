import React, { useMemo, useState } from 'react'
import { isWNative, lenderDisplayNameFull } from '@1delta/lib-utils'
import { zeroAddress } from 'viem'
import type { LenderData, PoolDataItem } from '../../hooks/lending/usePoolData'
import { usePoolConfigData } from '../../hooks/lending/usePoolData'
import { ConfigMarketView } from './ConfigMarketView'
import type {
  UserDataResult,
  UserPositionEntry,
  UserSubAccount,
} from '../../hooks/lending/useUserData'
import { useTokenBalances } from '../../hooks/lending/useTokenBalances'
import { useTokenLists } from '../../hooks/useTokenLists'
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
import { formatUsd, abbreviateUsd, computeLenderTvl } from '../../utils/format'
import { sortPools, type SortKey, LtvBadge } from './Dashboard'
import { YourPositions, type PositionSummary } from './YourPositions'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  lenderData: LenderData | undefined
  userData: UserDataResult
  chainId: string
  account?: string
  isPublicDataLoading: boolean
  isUserDataLoading: boolean
}

export function LendingDashboard({
  lenderData,
  userData,
  chainId,
  account,
  isPublicDataLoading,
  isUserDataLoading,
}: Props) {
  const { syncChain, currentChainId } = useSyncChain()
  const isWrongChain = !!account && currentChainId !== Number(chainId)
  const isMobile = useIsMobile()

  // Lender selection
  const allLenderKeys = useMemo(() => Object.keys(lenderData ?? {}), [lenderData])

  const [selectedLender, setSelectedLender] = useState<string>('')
  const [selectedSubAccountId, setSelectedSubAccountId] = useState<string | null>(null)
  const [selectedPool, setSelectedPool] = useState<PoolDataItem | null>(null)
  const [actionTab, setActionTab] = useState<ActionType>('Deposit')

  // View mode: default flat list vs config-grouped view
  const [viewMode, setViewMode] = useState<'default' | 'config'>('default')

  // Search & sort state
  const [assetSearch, setAssetSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('totalDepositsUSD')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showMobileAction, setShowMobileAction] = useState(false)

  // Per-lender user balance (deposits USD) for sorting & markers
  const lenderBalances = useMemo(() => {
    const map = new Map<string, number>()
    if (!userData.raw) return map
    for (const entry of userData.raw) {
      if (entry.chainId !== chainId) continue
      const total = entry.balanceData.deposits + entry.balanceData.debt
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
    icon: `https://raw.githubusercontent.com/1delta-DAO/protocol-icons/main/lender/${l.toLowerCase()}.webp`,
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
    const entry = userData.raw.find((e) => e.chainId === chainId && e.lender === selectedLender)
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
    () => subAccounts.find((s) => s.accountId === selectedSubAccountId) ?? null,
    [subAccounts, selectedSubAccountId]
  )

  // All pools for selected lender
  const allPools = useMemo(() => {
    if (!selectedLender || !lenderData) return []
    return lenderData[selectedLender] ?? []
  }, [lenderData, selectedLender])

  // Config-grouped pool data (fetched when config view is active)
  const { data: configGroups, isLoading: isConfigLoading } = usePoolConfigData(
    chainId,
    selectedLender
  )

  // Token lists for native token lookup
  const { data: chainTokens } = useTokenLists(chainId)

  // Whether any pool in this lender uses wrapped native
  const hasWrappedNative = useMemo(() => allPools.some((p) => isWNative(p.asset)), [allPools])

  // Unique asset addresses for the current lender's pools
  // Include zeroAddress so we also fetch the native balance when relevant
  const poolAssetAddresses = useMemo(() => {
    const addrs = [...new Set(allPools.map((p) => p.underlying))]
    if (hasWrappedNative) addrs.push(zeroAddress)
    return addrs
  }, [allPools, hasWrappedNative])

  // Wallet token balances for these assets
  const { balances: walletBalances } = useTokenBalances({
    chainId,
    account,
    assets: poolAssetAddresses,
  })

  // Filtered & sorted pools
  const pools = useMemo(
    () => sortPools(allPools, assetSearch, sortKey, sortDir),
    [allPools, assetSearch, sortKey, sortDir]
  )

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
  const lenderSummary: PositionSummary | null = useMemo(() => {
    if (!activeSubAccount) return null
    const bd = activeSubAccount.balanceData
    if (bd.deposits === 0 && bd.debt === 0) return null

    const ad = activeSubAccount.aprData
    return {
      deposits: bd.deposits,
      debt: bd.debt,
      nav: bd.nav,
      health: activeSubAccount.health,
      apr: ad.apr,
      depositApr: ad.depositApr,
      borrowApr: ad.borrowApr,
      intrinsicApr: ad.intrinsicApr,
      intrinsicDepositApr: ad.intrinsicDepositApr,
      intrinsicBorrowApr: ad.intrinsicBorrowApr,
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
    const deselecting = selectedPool?.marketUid === pool.marketUid
    setSelectedPool(deselecting ? null : pool)
    if (!deselecting) setShowMobileAction(true)
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

  // Native token info when the selected pool's underlying is wrapped native
  const nativeToken = useMemo(() => {
    if (!selectedPool || !isWNative(selectedPool.asset)) return null
    return chainTokens[zeroAddress] ?? null
  }, [selectedPool, chainTokens])

  const nativeBalance = useMemo(() => {
    if (!nativeToken) return null
    return walletBalances.get(zeroAddress) ?? null
  }, [nativeToken, walletBalances])

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
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium shrink-0">Lender:</label>
        <SearchableSelect
          options={lenderOptions}
          value={selectedLender}
          onChange={handleLenderChange}
          placeholder="Search lenders..."
        />
        {lenderBalances.size > 0 && (
          <span className="text-xs text-base-content/50 shrink-0">{'\u25CF'} = has balance</span>
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
        <YourPositions
          subAccounts={subAccounts}
          selectedSubAccountId={selectedSubAccountId}
          onSubAccountChange={setSelectedSubAccountId}
          summary={lenderSummary}
          activePositions={activePositions}
          account={account}
          chainId={chainId}
          selectedLender={selectedLender}
          selectedPoolMarketUid={selectedPool?.marketUid}
          onPoolSelect={handlePoolSelect}
        />
      )}

      {/* Two column layout: Markets + Action Panel */}
      <div className="flex gap-4 items-start">
        {/* Left: Market data */}
        <div className="flex-1 min-w-0">
          {/* View mode toggle */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-0.5 bg-base-200 rounded-lg p-0.5">
              <button
                type="button"
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'default'
                    ? 'bg-base-100 shadow-sm text-base-content'
                    : 'text-base-content/60 hover:text-base-content'
                }`}
                onClick={() => setViewMode('default')}
              >
                Default
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'config'
                    ? 'bg-base-100 shadow-sm text-base-content'
                    : 'text-base-content/60 hover:text-base-content'
                }`}
                onClick={() => setViewMode('config')}
              >
                Config
              </button>
            </div>
          </div>

          {viewMode === 'config' ? (
            <ConfigMarketView
              configGroups={configGroups ?? []}
              allPools={allPools}
              selectedMarketUid={selectedPool?.marketUid}
              onPoolSelect={handlePoolSelect}
              userPositions={userPositions}
              isLoading={isConfigLoading}
            />
          ) : (
          <div className="rounded-box border border-base-300 overflow-hidden">
          {/* Search + legend */}
          <div className="p-2 border-b border-base-300 flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by name, symbol or address..."
              className="input input-bordered input-sm flex-1"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
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
                  <th className="cursor-pointer select-none" onClick={() => toggleSort('symbol')}>
                    Asset
                    {sortKey === 'symbol' && (
                      <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('depositApr')}
                  >
                    Deposit APR
                    {sortKey === 'depositApr' && (
                      <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('borrowApr')}
                  >
                    Borrow APR
                    {sortKey === 'borrowApr' && (
                      <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th>LTV</th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('totalDepositsUSD')}
                  >
                    Total Deposits
                    {sortKey === 'totalDepositsUSD' && (
                      <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('totalDebtUSD')}
                  >
                    Total Borrows
                    {sortKey === 'totalDebtUSD' && (
                      <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('totalLiquidityUSD')}
                  >
                    Liquidity
                    {sortKey === 'totalLiquidityUSD' && (
                      <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pools.map((pool) => {
                  const isSelected = selectedPool?.marketUid === pool.marketUid
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
                      onClick={() => handlePoolSelect(pool)}
                    >
                      <td className="max-w-40">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative shrink-0 w-7 h-7">
                            <img
                              src={pool.asset.logoURI}
                              width={28}
                              height={28}
                              alt={pool.asset.symbol}
                              className="rounded-full object-contain w-7 h-7"
                            />
                            {hasPosition && (
                              <span
                                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-base-100"
                                title="You have a position"
                              />
                            )}
                          </div>
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
                        </div>
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
                        <span className="text-xs" title={`$${formatUsd(pool.totalDepositsUSD)}`}>
                          {abbreviateUsd(pool.totalDepositsUSD)}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs" title={`$${formatUsd(pool.totalDebtUSD)}`}>
                          {abbreviateUsd(pool.totalDebtUSD)}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs" title={`$${formatUsd(pool.totalLiquidityUSD)}`}>
                          {abbreviateUsd(pool.totalLiquidityUSD)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {pools.length === 0 && (
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
          <div className="md:hidden divide-y divide-base-300">
            {pools.length > 0 && (
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
            {pools.map((pool) => {
              const isSelected = selectedPool?.marketUid === pool.marketUid
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
                  onClick={() => handlePoolSelect(pool)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative shrink-0 w-7 h-7">
                        <img
                          src={pool.asset.logoURI}
                          width={28}
                          height={28}
                          alt={pool.asset.symbol}
                          className="rounded-full object-contain w-7 h-7"
                        />
                        {hasPosition && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-base-100" />
                        )}
                      </div>
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
                    </div>
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
          </div>
          )}
        </div>

        {/* Right: Action panel — desktop only */}
        <div className="hidden md:block w-72 shrink-0 rounded-box border border-base-300 p-3 space-y-3 sticky top-4">
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
                className="rounded-full object-contain w-8 h-8 shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate" title={selectedPool.name}>
                  {selectedPool.name}
                </span>
                <span className="text-xs text-base-content/60 truncate" title={selectedPool.asset.symbol}>
                  {selectedPool.asset.symbol}
                </span>
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
                <DepositAction
                  pool={selectedPool}
                  userPosition={selectedPoolUserPos}
                  walletBalance={selectedPoolWalletBal}
                  account={account}
                  chainId={chainId}
                  accountId={selectedSubAccountId ?? undefined}
                  subAccounts={subAccounts}
                  lenderKey={selectedLender}
                  nativeToken={nativeToken}
                  nativeBalance={nativeBalance}
                  subAccount={activeSubAccount ?? undefined}
                />
              )}
              {actionTab === 'Withdraw' && (
                <WithdrawAction
                  pool={selectedPool}
                  userPosition={selectedPoolUserPos}
                  walletBalance={selectedPoolWalletBal}
                  account={account}
                  chainId={chainId}
                  accountId={selectedSubAccountId ?? undefined}
                  subAccounts={subAccounts}
                  lenderKey={selectedLender}
                  nativeToken={nativeToken}
                  nativeBalance={nativeBalance}
                  subAccount={activeSubAccount ?? undefined}
                />
              )}
              {actionTab === 'Borrow' && (
                <BorrowAction
                  pool={selectedPool}
                  userPosition={selectedPoolUserPos}
                  walletBalance={selectedPoolWalletBal}
                  account={account}
                  chainId={chainId}
                  accountId={selectedSubAccountId ?? undefined}
                  subAccounts={subAccounts}
                  lenderKey={selectedLender}
                  nativeToken={nativeToken}
                  nativeBalance={nativeBalance}
                  subAccount={activeSubAccount ?? undefined}
                />
              )}
              {actionTab === 'Repay' && (
                <RepayAction
                  pool={selectedPool}
                  userPosition={selectedPoolUserPos}
                  walletBalance={selectedPoolWalletBal}
                  account={account}
                  chainId={chainId}
                  accountId={selectedSubAccountId ?? undefined}
                  subAccounts={subAccounts}
                  lenderKey={selectedLender}
                  nativeToken={nativeToken}
                  nativeBalance={nativeBalance}
                  subAccount={activeSubAccount ?? undefined}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile action panel modal */}
      {isMobile && showMobileAction && selectedPool && (
        <div className="modal modal-open" onClick={() => setShowMobileAction(false)}>
          <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              onClick={() => setShowMobileAction(false)}
            >
              ✕
            </button>

            <div className="space-y-3">
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

              {/* Selected asset */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200">
                <img
                  src={selectedPool.asset.logoURI}
                  width={32}
                  height={32}
                  alt={selectedPool.asset.symbol}
                  className="rounded-full object-contain w-8 h-8 shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-sm truncate" title={selectedPool.name}>
                    {selectedPool.name}
                  </span>
                  <span className="text-xs text-base-content/60 truncate" title={selectedPool.asset.symbol}>
                    {selectedPool.asset.symbol}
                  </span>
                </div>
              </div>

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
                    <DepositAction
                      pool={selectedPool}
                      userPosition={selectedPoolUserPos}
                      walletBalance={selectedPoolWalletBal}
                      account={account}
                      chainId={chainId}
                      accountId={selectedSubAccountId ?? undefined}
                      subAccounts={subAccounts}
                      lenderKey={selectedLender}
                      nativeToken={nativeToken}
                      nativeBalance={nativeBalance}
                      subAccount={activeSubAccount ?? undefined}
                    />
                  )}
                  {actionTab === 'Withdraw' && (
                    <WithdrawAction
                      pool={selectedPool}
                      userPosition={selectedPoolUserPos}
                      walletBalance={selectedPoolWalletBal}
                      account={account}
                      chainId={chainId}
                      accountId={selectedSubAccountId ?? undefined}
                      subAccounts={subAccounts}
                      lenderKey={selectedLender}
                      nativeToken={nativeToken}
                      nativeBalance={nativeBalance}
                      subAccount={activeSubAccount ?? undefined}
                    />
                  )}
                  {actionTab === 'Borrow' && (
                    <BorrowAction
                      pool={selectedPool}
                      userPosition={selectedPoolUserPos}
                      walletBalance={selectedPoolWalletBal}
                      account={account}
                      chainId={chainId}
                      accountId={selectedSubAccountId ?? undefined}
                      subAccounts={subAccounts}
                      lenderKey={selectedLender}
                      nativeToken={nativeToken}
                      nativeBalance={nativeBalance}
                      subAccount={activeSubAccount ?? undefined}
                    />
                  )}
                  {actionTab === 'Repay' && (
                    <RepayAction
                      pool={selectedPool}
                      userPosition={selectedPoolUserPos}
                      walletBalance={selectedPoolWalletBal}
                      account={account}
                      chainId={chainId}
                      accountId={selectedSubAccountId ?? undefined}
                      subAccounts={subAccounts}
                      lenderKey={selectedLender}
                      nativeToken={nativeToken}
                      nativeBalance={nativeBalance}
                      subAccount={activeSubAccount ?? undefined}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

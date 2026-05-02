import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isWNative } from '../../../../lib/lib-utils'
import { zeroAddress } from 'viem'
import { OPTIMIZER_DEEPLINK_KEYS, type LendingDeepLinkAction } from '../../../../utils/routes'
import type {
  LenderData,
  LenderInfoMap,
  LenderSummary,
  PoolDataItem,
} from '../../../../hooks/lending/usePoolData'
import { usePoolConfigData } from '../../../../hooks/lending/usePoolData'
import { ConfigMarketView } from '../../shared/ConfigMarketView'
import { RiskSelect } from '../../shared/RiskSelect'
import type {
  UserDataResult,
  UserPositionEntry,
  UserSubAccount,
} from '../../../../hooks/lending/useUserData'
import { useTokenBalances } from '../../../../hooks/lending/useTokenBalances'
import { useLenderAccounts } from '../../../../hooks/lending/useLenderAccounts'
import { useTokenLists } from '../../../../hooks/useTokenLists'
import { useSyncChain } from '../../../../hooks/useSyncChain'
import type { ActionType } from '../../actions'
import { sortPools, type SortKey } from '../../dashboard'
import { YourPositions, type PositionSummary } from '../../shared/YourPositions'
import { useIsMobile } from '../../../../hooks/useIsMobile'
import { useLenderSelector, LenderSelector } from '../../shared/LenderSelector'
import { LendingMarketTable } from './LendingMarketTable'
import { ActionPanel, MobileActionModal } from './ActionPanel'
import { usePersistedFilters } from '../../../../hooks/usePersistedFilters'

interface Props {
  /**
   * Lightweight per-lender summaries (drives the dropdown). Optional —
   * `lenderData` is used as a fallback for the dropdown when summaries
   * aren't passed in.
   */
  lenderSummaries?: LenderSummary[]
  lenderData: LenderData | undefined
  lenderInfoMap?: LenderInfoMap
  userData: UserDataResult
  chainId: string
  account?: string
  isPublicDataLoading: boolean
  isUserDataLoading: boolean
  /**
   * Controlled lender selection. Owned by `LendingTab` so the heavy
   * `useLendingLatest` fetch can be scoped to a single lender.
   */
  selectedLender: string
  onLenderChange: (lender: string) => void
}

export function LendingDashboard({
  lenderSummaries,
  lenderData,
  lenderInfoMap,
  userData,
  chainId,
  account,
  isPublicDataLoading,
  isUserDataLoading,
  selectedLender,
  onLenderChange,
}: Props) {
  const { syncChain, currentChainId } = useSyncChain()
  const isWrongChain = !!account && currentChainId !== Number(chainId)
  const isMobile = useIsMobile()

  // Dropdown options + balance markers. Selection is now controlled by the
  // parent (LendingTab) via `selectedLender` / `onLenderChange`.
  const { lenderOptions, lenderBalances } = useLenderSelector({
    lenderSummaries,
    lenderData,
    lenderInfoMap,
    userData,
    chainId,
  })

  const [selectedSubAccountId, setSelectedSubAccountId] = useState<string | null>(null)
  const [selectedPool, setSelectedPool] = useState<PoolDataItem | null>(null)
  const [actionTab, setActionTab] = useState<ActionType>('Deposit')

  // Optimizer → Lending deep-link consumer. The optimizer pushes
  // ?col=&debt=&action=&config=&amt= when the user clicks Supply / Borrow on
  // a row. We resolve the addresses against the current lender's `allPools`
  // once they're loaded and seed the action panel exactly once, then strip
  // the params so subsequent navigation isn't sticky.
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkConsumedRef = useRef<string | null>(null)

  // Persisted filters
  const {
    filters: lf,
    setFilter: setLF,
    resetToDefaults: resetLendingFilters,
  } = usePersistedFilters(
    'lending-dashboard',
    {
      viewMode: 'config',
      maxRiskScore: 4,
      sortKey: 'totalDepositsUSD' as string,
      sortDir: 'desc' as string,
    },
    { chainId }
  )
  const viewMode = lf.viewMode as 'default' | 'config'
  const maxRiskScore = lf.maxRiskScore
  const sortKey = lf.sortKey as SortKey
  const sortDir = lf.sortDir as 'asc' | 'desc'
  const setViewMode = (v: 'default' | 'config') => setLF('viewMode', v)
  const setMaxRiskScore = (v: number) => setLF('maxRiskScore', v)
  const setSortKey = (v: SortKey) => setLF('sortKey', v)
  const setSortDir = (v: 'asc' | 'desc') => setLF('sortDir', v)

  // Transient UI state
  const [assetSearch, setAssetSearch] = useState('')
  const [showMobileAction, setShowMobileAction] = useState(false)

  // Sub-accounts from user-positions (balances + APRs)
  const userSubAccounts: UserSubAccount[] = useMemo(() => {
    if (!selectedLender || !userData.raw) return []
    const entry = userData.raw.find((e) => e.chainId === chainId && e.lender === selectedLender)
    return entry?.data ?? []
  }, [userData, chainId, selectedLender])

  // Merge with next-account activeAccountIds so existing-but-empty accounts
  // (e.g. Gearbox Credit Accounts with no current position) still render.
  const { subAccounts } = useLenderAccounts({
    chainId,
    lender: selectedLender,
    account,
    userSubAccounts,
  })

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

  // Hydrate the action panel from optimizer deep-link query params once the
  // lender's pools are available. We dedupe by the param signature so that
  // re-renders don't re-fire after we've stripped the params from the URL.
  useEffect(() => {
    if (allPools.length === 0) return
    const colAddr = searchParams.get(OPTIMIZER_DEEPLINK_KEYS.collateral)
    const debtAddr = searchParams.get(OPTIMIZER_DEEPLINK_KEYS.debt)
    const actionParam = searchParams.get(OPTIMIZER_DEEPLINK_KEYS.action) as
      | LendingDeepLinkAction
      | null
    if (!colAddr && !debtAddr) return

    const signature = `${selectedLender}:${colAddr ?? ''}:${debtAddr ?? ''}:${actionParam ?? ''}`
    if (deepLinkConsumedRef.current === signature) return
    deepLinkConsumedRef.current = signature

    // For Borrow actions, the relevant pool is the *debt* pool — the user
    // wants to borrow Y, and the receiving panel needs the collateral
    // already in place via their existing position. For Supply / Withdraw /
    // Repay the relevant pool is the collateral leg.
    const targetAddress =
      actionParam === 'borrow' || actionParam === 'repay' ? debtAddr : colAddr
    if (targetAddress) {
      const match = allPools.find(
        (p) => p.underlying.toLowerCase() === targetAddress.toLowerCase()
      )
      if (match) setSelectedPool(match)
    }

    if (actionParam) {
      const map: Record<LendingDeepLinkAction, ActionType> = {
        deposit: 'Deposit',
        withdraw: 'Withdraw',
        borrow: 'Borrow',
        repay: 'Repay',
      }
      setActionTab(map[actionParam])
    }

    // Strip the optimizer params so the next navigation starts clean. We
    // keep any unrelated params intact.
    const next = new URLSearchParams(searchParams)
    for (const k of Object.values(OPTIMIZER_DEEPLINK_KEYS)) next.delete(k)
    setSearchParams(next, { replace: true })
  }, [allPools, searchParams, setSearchParams, selectedLender])

  // Config-grouped pool data (fetched when config view is active)
  const { data: configGroups, isLoading: isConfigLoading } = usePoolConfigData(
    chainId,
    selectedLender,
    maxRiskScore
  )

  // Token lists for native token lookup
  const { data: chainTokens } = useTokenLists(chainId)

  // Whether any pool in this lender uses wrapped native
  const hasWrappedNative = useMemo(() => allPools.some((p) => isWNative(p.asset)), [allPools])

  // Unique asset addresses for the current lender's pools
  const poolAssetAddresses = useMemo(() => {
    const addrs = [...new Set(allPools.map((p) => p.underlying))]
    if (hasWrappedNative) addrs.push(zeroAddress)
    return addrs
  }, [allPools, hasWrappedNative])

  // Wallet token balances for these assets
  const {
    balances: walletBalances,
    isBalancesFetching,
    refetchBalances,
  } = useTokenBalances({
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
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
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

  // Handle lender change — propagate to the parent (URL-backed) and reset
  // local selection state so we don't carry stale pool / sub-account picks
  // across lenders. The local-state resets fire on the same render as the
  // upstream URL push, so the next render sees a fresh `selectedLender`
  // alongside cleared selection state.
  const handleLenderChange = (lender: string) => {
    onLenderChange(lender)
    setSelectedSubAccountId(null)
    setSelectedPool(null)
  }

  // User position for the currently selected pool
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

  // Lender info for the selected lender
  const activeLenderInfo =
    selectedLender && lenderInfoMap ? lenderInfoMap[selectedLender] : undefined

  // Shared action panel props
  const actionPanelProps = {
    actionTab,
    onTabChange: setActionTab,
    selectedPool,
    selectedPoolUserPos,
    selectedPoolWalletBal,
    account,
    chainId,
    isWrongChain,
    syncChain,
    selectedSubAccountId,
    subAccounts,
    selectedLender,
    nativeToken,
    nativeBalance,
    activeSubAccount,
    lenderInfo: activeLenderInfo,
    isBalancesFetching,
    refetchBalances,
  }

  if (isPublicDataLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Lender selector */}
      <LenderSelector
        lenderOptions={lenderOptions}
        selectedLender={selectedLender}
        onChange={handleLenderChange}
        hasBalances={lenderBalances.size > 0}
      />

      {/* User positions grouped by sub-account */}
      {account && isUserDataLoading && (
        <div className="rounded-box border border-base-300 p-3 sm:p-4 flex items-center gap-2">
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
                  viewMode === 'config'
                    ? 'bg-base-100 shadow-sm text-base-content'
                    : 'text-base-content/60 hover:text-base-content'
                }`}
                onClick={() => setViewMode('config')}
              >
                By Config
              </button>
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
            </div>

            <RiskSelect value={maxRiskScore} onChange={setMaxRiskScore} />
            <button
              type="button"
              className="btn btn-xs btn-ghost text-base-content/50"
              onClick={resetLendingFilters}
              title="Reset filters to defaults"
            >
              Reset
            </button>
          </div>

          {viewMode === 'config' ? (
            <ConfigMarketView
              configGroups={configGroups ?? []}
              allPools={allPools}
              selectedMarketUid={selectedPool?.marketUid}
              onPoolSelect={handlePoolSelect}
              userPositions={userPositions}
              isLoading={isConfigLoading}
              userActiveCategory={
                activeSubAccount ? String(activeSubAccount.userConfig.selectedMode) : null
              }
            />
          ) : (
            <LendingMarketTable
              pools={pools}
              userPositions={userPositions}
              selectedMarketUid={selectedPool?.marketUid}
              onPoolSelect={handlePoolSelect}
              assetSearch={assetSearch}
              onAssetSearchChange={setAssetSearch}
              sortKey={sortKey}
              sortDir={sortDir}
              onToggleSort={toggleSort}
            />
          )}
        </div>

        {/* Right: Action panel — desktop only */}
        <ActionPanel {...actionPanelProps} />
      </div>

      {/* Mobile action panel modal */}
      {isMobile && showMobileAction && (
        <MobileActionModal {...actionPanelProps} onClose={() => setShowMobileAction(false)} />
      )}
    </div>
  )
}

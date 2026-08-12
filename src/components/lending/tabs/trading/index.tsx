import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  findConfigContaining,
  readOptimizerDeepLink,
  resolveDeepLinkPool,
  stripDeepLinkParams,
} from '../../shared/deepLink'
import type { InitialActionSelection } from './types'
import type {
  LenderData,
  LenderInfoMap,
  LenderSummary,
  PoolDataItem,
} from '../../../../sdk/lending-helper/marketTypes'
import { usePoolConfigData } from '../../../../hooks/lending/usePoolData'
import { ConfigMarketView } from '../../shared/ConfigMarketView'
import { useRiskMode } from '../../../../contexts/RiskMode'
import type {
  UserDataResult,
  UserPositionEntry,
  UserSubAccount,
} from '../../../../sdk/lending-helper/userPositionTypes'
import { isAggregatePosition, isLoanPosition } from '../../../../sdk/lending-helper/userPositionTypes'
import { useTokenBalances } from '../../../../hooks/lending/useTokenBalances'
import { useLenderAccounts } from '../../../../hooks/lending/useLenderAccounts'
import { useSyncChain } from '../../../../hooks/useSyncChain'
import { useSpyMode } from '../../../../contexts/SpyMode'
import { WalletConnect } from '../../../connect'
import { useLenderSelector, LenderSelector } from '../../shared/LenderSelector'
import { SpyModeNotice } from '../../shared/SpyModeNotice'
import { TradingMarketTable } from './TradingMarketTable'
import { LoopAction } from './actions/LoopAction'
import { ColSwapAction } from './actions/ColSwapAction'
import { DebtSwapAction } from './actions/DebtSwapAction'
import { CloseAction } from './actions/CloseAction'
import type { TradingOperation, SelectedPool, TableHighlight } from './types'
import { usePersistedFilters } from '../../../../hooks/usePersistedFilters'
import { YourPositions, type PositionSummary } from '../../shared/YourPositions'
import { useIsMobile } from '../../../../hooks/useIsMobile'

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

const OPERATIONS: TradingOperation[] = ['Loop', 'ColSwap', 'DebtSwap', 'Close']
const OP_LABELS: Record<TradingOperation, string> = {
  Loop: 'Loop',
  ColSwap: 'Col. Swap',
  DebtSwap: 'Debt Swap',
  Close: 'Close',
}

export function TradingDashboard({
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
  const { isSpyMode } = useSpyMode()
  // In spy mode `account` is the spied address (not the connected wallet),
  // so the wallet/chain gates would always misfire. Hide them entirely and
  // show a read-only notice instead.
  const isWrongChain = !isSpyMode && !!account && currentChainId !== Number(chainId)
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
  // Persisted filters
  const {
    filters: tf,
    setFilter: setTF,
    resetToDefaults: resetTradingFilters,
  } = usePersistedFilters(
    'trading-dashboard',
    { activeOperation: 'Loop' as string, viewMode: 'config' },
    { chainId }
  )
  // Risk ceiling is app-wide (next to the network selector), not a per-tab filter.
  const { maxRiskScore } = useRiskMode()
  const activeOperation = tf.activeOperation as TradingOperation
  const viewMode = tf.viewMode as 'default' | 'config'
  const setActiveOperation = (v: TradingOperation) => setTF('activeOperation', v)
  const setViewMode = (v: 'default' | 'config') => setTF('viewMode', v)

  // Transient UI state
  const [selectedPools, setSelectedPools] = useState<SelectedPool[]>([])
  const [showMobileAction, setShowMobileAction] = useState(false)
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  // Config requested by an optimizer hand-off (`?config=`). Kept apart from
  // `selectedConfigId` — that one tracks whatever is currently open, while this
  // records what was ASKED for, which is what ConfigMarketView needs to
  // outrank its own default once the groups load.
  const [pinnedConfigId, setPinnedConfigId] = useState<string | null>(null)
  // Click on a by-config row → buffered here so the active action's effect
  // can route it to the matching slot. Cleared by the action via
  // consumeMarketClick once it's been applied.
  const [pendingMarketClick, setPendingMarketClick] = useState<{
    pool: PoolDataItem
    side: 'collateral' | 'borrowable'
    /** Bumped on every set so the same row clicked twice still triggers. */
    nonce: number
  } | null>(null)

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

  React.useEffect(() => {
    if (subAccounts.length > 0) {
      setSelectedSubAccountId(subAccounts[0].accountId)
    } else {
      setSelectedSubAccountId(null)
    }
  }, [subAccounts])

  const activeSubAccount = useMemo(
    () => subAccounts.find((s) => s.accountId === selectedSubAccountId) ?? null,
    [subAccounts, selectedSubAccountId]
  )

  // All pools for selected lender
  const allPools = useMemo(() => {
    if (!selectedLender || !lenderData) return []
    return lenderData[selectedLender] ?? []
  }, [lenderData, selectedLender])

  // Optimizer → Loop deep-link consumer. Once the lender's pools are loaded,
  // resolve the hand-off params to PoolDataItems and pass them down to the
  // action panel as `initialSelection`.
  //
  // STATE, not a ref consumed during render. The previous version read the ref
  // and nulled it in the render body, which lost the selection outright in two
  // ordinary situations, both of them races against data that loads on its own
  // schedule:
  //   1. `isPublicDataLoading` true on that render (react-query serves the
  //      optimizer's already-cached pools while refetching in the background)
  //      — the render returns a spinner BELOW this point, so nothing consumed
  //      the selection that had just been thrown away.
  //   2. The persisted `activeOperation` wasn't Loop — the switch to Loop
  //      happens in an effect one render later, so the render that cleared the
  //      ref never mounted LoopAction at all.
  // Either way the URL params were already stripped and the effect's signature
  // guard blocks a retry, so the pre-selection was gone for good.
  //
  // Keeping it in state is safe because LoopAction seeds from it only in its
  // `useState` initialisers, and its `key` (below) is derived from the
  // selection: an unchanged selection means no remount, so it cannot re-apply
  // over the user's later edits.
  const [searchParams, setSearchParams] = useSearchParams()
  const [pendingSelection, setPendingSelection] = useState<InitialActionSelection | null>(null)
  const deepLinkConsumedRef = useRef<string | null>(null)

  useEffect(() => {
    if (allPools.length === 0) return
    const link = readOptimizerDeepLink(searchParams)
    if (!link.hasPair && !link.configId) return

    const signature = `${selectedLender}:${link.signature}`
    if (deepLinkConsumedRef.current === signature) return
    deepLinkConsumedRef.current = signature

    // Market UID first, token address as the fallback. Resolving by address
    // alone picks whichever vault sorts first for that underlying, which on
    // Euler is routinely a different market than the row the user clicked —
    // the loop would then be priced off markets they never chose.
    const collateralPool = resolveDeepLinkPool(allPools, link.colMarketUid, link.colAddr)
    const debtPool = resolveDeepLinkPool(allPools, link.debtMarketUid, link.debtAddr)

    if (collateralPool || debtPool) {
      setPendingSelection({
        collateralPool,
        debtPool,
        amount: link.amount ? Number(link.amount) || undefined : undefined,
      })
    }

    // Pin the config the pair was priced against, so the leverage shown here
    // matches the row that was clicked instead of this tab's own default.
    if (link.configId) {
      setPinnedConfigId(link.configId)
      setViewMode('config')
    }

    setSearchParams(stripDeepLinkParams(searchParams), { replace: true })
    // `setViewMode` wraps the persisted-filter setter and is a fresh closure
    // every render — see the matching note in the Lending tab's consumer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPools, searchParams, setSearchParams, selectedLender])

  // Config-grouped pool data
  const { data: configGroups, isLoading: isConfigLoading } = usePoolConfigData(
    chainId,
    selectedLender,
    maxRiskScore
  )

  // Note: choosing the default config (the user's active e-mode, else the top
  // group) is owned by ConfigMarketView, which guards it behind its own
  // `userTouched` flag. Re-asserting a default here would re-open a config the
  // moment the user collapses it (the empty selection is coerced to ''),
  // causing a close→open flicker — so we don't.

  // Reset config + hand-off selection when the lender CHANGES. Config ids and
  // PoolDataItems are only meaningful within one lender, so neither may outlive
  // a switch.
  //
  // The previous-value guard is load-bearing, not defensive: this effect is
  // declared after the deep-link consumer, so on a mount where the pools are
  // already cached (arriving from the optimizer, which prefetched them) the
  // consumer sets the pin and the selection in the same commit — and an
  // unguarded reset would then wipe both before anything rendered.
  const prevLenderRef = useRef(selectedLender)
  React.useEffect(() => {
    if (prevLenderRef.current === selectedLender) return
    prevLenderRef.current = selectedLender
    setSelectedConfigId(null)
    setPinnedConfigId(null)
    setPendingSelection(null)
  }, [selectedLender])

  // Late-binding half of the hand-off: the pools and the config groups are two
  // independent fetches and the groups arrive second, long after the legs were
  // resolved and the URL params stripped. Derive the config from the pair so
  // the by-config view opens on a group that actually holds both legs instead
  // of its own default. Never overrides an explicit `?config=`.
  useEffect(() => {
    if (!pendingSelection || pinnedConfigId || !configGroups?.length) return
    const configId = findConfigContaining(
      configGroups,
      pendingSelection.collateralPool?.marketUid,
      pendingSelection.debtPool?.marketUid
    )
    if (configId) setPinnedConfigId(configId)
  }, [configGroups, pendingSelection, pinnedConfigId])

  // Active config group
  const activeConfigGroup = useMemo(
    () => configGroups?.find((g) => g.configId === selectedConfigId) ?? null,
    [configGroups, selectedConfigId]
  )

  // Preferred pools from selected config (bumped to top in dropdowns)
  const preferredCollateralUids = useMemo(() => {
    if (!activeConfigGroup?.collaterals) return new Set<string>()
    return new Set(activeConfigGroup.collaterals.map((c) => c.marketUid))
  }, [activeConfigGroup])

  const preferredBorrowableUids = useMemo(() => {
    if (!activeConfigGroup?.borrowables) return new Set<string>()
    return new Set(activeConfigGroup.borrowables.map((b) => b.marketUid))
  }, [activeConfigGroup])

  // User's active e-mode category (as string to match PoolConfigGroup.category)
  const userActiveCategory = activeSubAccount
    ? String(activeSubAccount.userConfig.selectedMode)
    : null

  // Config groups sorted with active e-mode first (for <select> dropdowns)
  const sortedConfigGroups = useMemo(() => {
    if (!configGroups) return []
    if (userActiveCategory == null) return configGroups
    return [...configGroups].sort((a, b) => {
      const aIsActive = a.category === userActiveCategory
      const bIsActive = b.category === userActiveCategory
      if (aIsActive && !bIsActive) return -1
      if (bIsActive && !aIsActive) return 1
      return 0
    })
  }, [configGroups, userActiveCategory])

  // All pools available as collateral / borrowable (unfiltered)
  const collateralPools = allPools
  const borrowablePools = allPools

  const poolAssetAddresses = useMemo(
    () => [...new Set(allPools.map((p) => p.underlying))],
    [allPools]
  )

  const {
    balances: walletBalances,
    isBalancesFetching,
    refetchBalances,
  } = useTokenBalances({
    chainId,
    account,
    assets: poolAssetAddresses,
  })

  // User positions scoped to selected sub-account, keyed by marketUid
  const userPositions = useMemo(() => {
    const map = new Map<string, UserPositionEntry>()
    if (!activeSubAccount) return map
    for (const pos of activeSubAccount.positions) {
      // Skip per-loan brokered rows — they share `marketUid` with the
      // aggregate row and would clobber it. Per-market consumers want the
      // aggregate; the loan list reads the per-loan rows separately.
      if (typeof pos === 'object' && pos !== null && isAggregatePosition(pos)) {
        map.set(pos.marketUid, pos)
      }
    }
    return map
  }, [activeSubAccount])

  // Balance summary
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

  // Active positions for cards
  const activePositions = useMemo(() => {
    const result: { position: UserPositionEntry; pool: PoolDataItem }[] = []
    for (const pool of allPools) {
      const pos = userPositions.get(pool.marketUid)
      if (pos && (Number(pos.deposits) > 0 || Number(pos.debt) > 0 || Number(pos.debtStable) > 0)) {
        result.push({ position: pos, pool })
      }
    }
    return result
  }, [allPools, userPositions])

  // Per-loan brokered rows grouped by market, for the YourPositions breakdown.
  const loansByMarket = useMemo(() => {
    const map = new Map<string, UserPositionEntry[]>()
    if (!activeSubAccount) return map
    for (const pos of activeSubAccount.positions) {
      if (typeof pos === 'object' && pos !== null && isLoanPosition(pos)) {
        const arr = map.get(pos.marketUid) ?? []
        arr.push(pos)
        map.set(pos.marketUid, arr)
      }
    }
    return map
  }, [activeSubAccount])

  // Table highlights from action panel's pool selections
  const tableHighlights: TableHighlight[] = useMemo(
    () =>
      selectedPools.map((sp) => ({
        marketUid: sp.pool.marketUid,
        role: sp.role,
        side: sp.side,
      })),
    [selectedPools]
  )

  // Propagate to the parent (URL-backed) and clear local pool / sub-account
  // selection so we don't carry stale picks across lenders.
  const handleLenderChange = (lender: string) => {
    onLenderChange(lender)
    setSelectedSubAccountId(null)
    setSelectedPools([])
    setPendingMarketClick(null)
  }

  const handlePoolSelectionChange = useCallback((selections: SelectedPool[]) => {
    setSelectedPools(selections)
  }, [])

  const handleAccountIdChange = useCallback((id: string | null) => {
    setSelectedSubAccountId(id)
  }, [])

  // The receiving action's `key` includes the selection signature, so a NEW
  // hand-off forces a fresh mount that re-runs its initialiser with the new
  // pools, while the same one re-rendering leaves the mounted action alone.
  const initialSelectionKey = pendingSelection
    ? `${pendingSelection.collateralPool?.marketUid ?? ''}:${
        pendingSelection.debtPool?.marketUid ?? ''
      }:${pendingSelection.amount ?? ''}`
    : ''

  // Whenever a deep-link arrives, force the active operation to Loop —
  // every Optimizer row maps to a leveraged loop, not a swap or close.
  useEffect(() => {
    if (pendingSelection && activeOperation !== 'Loop') {
      setActiveOperation('Loop')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectionKey])

  if (isPublicDataLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  const actionProps = {
    allPools,
    collateralPools,
    borrowablePools,
    preferredCollateralUids,
    preferredBorrowableUids,
    userPositions,
    walletBalances,
    subAccounts,
    selectedLender,
    chainId,
    account,
    accountId: selectedSubAccountId ?? undefined,
    isBalancesFetching,
    refetchBalances,
    onAccountIdChange: handleAccountIdChange,
    onPoolSelectionChange: handlePoolSelectionChange,
    initialSelection: pendingSelection ?? undefined,
    pendingMarketClick,
    consumeMarketClick: () => setPendingMarketClick(null),
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

      {/* User positions + sub-account selector */}
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
          loansByMarket={loansByMarket}
          account={account}
          chainId={chainId}
          selectedLender={selectedLender}
          // Click on a position row → buffer it for the active action's
          // routing effect. Same plumbing as by-config row clicks: deposits
          // section fires with side='collateral', debt section with
          // side='borrowable'.
          onPoolSelect={(pool, side) =>
            setPendingMarketClick({ pool, side, nonce: Date.now() })
          }
        />
      )}

      {/* Two column: Market table + Action panel */}
      <div className="flex gap-4 items-start">
        {/* Left: Market table (read-only, highlights driven by action panel) */}
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

            <button
              type="button"
              className="btn btn-xs btn-ghost text-base-content/50"
              onClick={resetTradingFilters}
              title="Reset filters to defaults"
            >
              Reset
            </button>
          </div>

          {viewMode === 'config' ? (
            <ConfigMarketView
              configGroups={configGroups ?? []}
              allPools={allPools}
              selectedConfigId={selectedConfigId}
              onConfigChange={setSelectedConfigId}
              pinnedConfigId={pinnedConfigId}
              onPoolSelect={(pool, side) => {
                setPendingMarketClick({ pool, side, nonce: Date.now() })
              }}
              userPositions={userPositions}
              highlights={tableHighlights}
              isLoading={isConfigLoading}
              userActiveCategory={userActiveCategory}
            />
          ) : (
            <TradingMarketTable
              pools={allPools}
              userPositions={userPositions}
              highlights={tableHighlights}
            />
          )}
        </div>

        {/* Right: Action panel — desktop only */}
        <div className="hidden md:block w-72 shrink-0 rounded-box border border-base-300 p-3 space-y-3 sticky top-4">
          {/* Active config \u2014 selected from the table; shown read-only here */}
          {sortedConfigGroups.length > 0 &&
            (() => {
              const active = sortedConfigGroups.find((g) => g.configId === selectedConfigId)
              if (!active) return null
              const rawLabel = (active.label || `Config ${active.configId}`).trim()
              const labelText =
                rawLabel.toLowerCase() === 'disabled' ? 'Standard (no e-mode)' : rawLabel
              const isUserMode =
                userActiveCategory !== null && active.category === userActiveCategory
              return (
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <span className="text-[10px] uppercase tracking-wider text-base-content/40 shrink-0">
                    Config
                  </span>
                  <span className="text-xs font-medium truncate" title={labelText}>
                    {labelText}
                    {isUserMode && (
                      <span className="ml-1.5 text-[10px] font-medium text-success/80">
                        active
                      </span>
                    )}
                  </span>
                </div>
              )
            })()}

          {/* Operation tabs */}
          <div role="tablist" className="tabs tabs-boxed tabs-xs">
            {OPERATIONS.map((op) => (
              <button
                key={op}
                type="button"
                role="tab"
                className={`tab ${activeOperation === op ? 'tab-active' : ''}`}
                onClick={() => {
                  setActiveOperation(op)
                  setSelectedPools([])
                  setPendingMarketClick(null)
                }}
              >
                {OP_LABELS[op]}
              </button>
            ))}
          </div>

          {/* Wallet / chain guards (suppressed in spy mode — quotes still work) */}
          {isSpyMode && <SpyModeNotice />}
          {!isSpyMode && !account ? (
            <div className="w-full flex justify-center">
              <WalletConnect />
            </div>
          ) : !isSpyMode && isWrongChain ? (
            <button
              type="button"
              className="btn btn-warning btn-sm w-full"
              onClick={() => syncChain(Number(chainId))}
            >
              Switch Wallet Chain
            </button>
          ) : (
            <>
              {activeOperation === 'Loop' && (
                <LoopAction key={`${selectedLender}:${initialSelectionKey}`} {...actionProps} />
              )}
              {activeOperation === 'ColSwap' && (
                <ColSwapAction key={selectedLender} {...actionProps} />
              )}
              {activeOperation === 'DebtSwap' && (
                <DebtSwapAction key={selectedLender} {...actionProps} />
              )}
              {activeOperation === 'Close' && <CloseAction key={selectedLender} {...actionProps} />}
            </>
          )}
        </div>
      </div>

      {/* Mobile action button */}
      <div className="md:hidden fixed bottom-4 left-0 right-0 flex justify-center z-40">
        <button
          type="button"
          className="btn btn-primary btn-sm shadow-lg"
          onClick={() => setShowMobileAction(true)}
        >
          {OP_LABELS[activeOperation]} Action
        </button>
      </div>

      {/* Mobile action panel modal */}
      {isMobile && showMobileAction && (
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
                {OPERATIONS.map((op) => (
                  <button
                    key={op}
                    type="button"
                    role="tab"
                    className={`tab ${activeOperation === op ? 'tab-active' : ''}`}
                    onClick={() => {
                      setActiveOperation(op)
                      setSelectedPools([])
                    }}
                  >
                    {OP_LABELS[op]}
                  </button>
                ))}
              </div>

              {/* Wallet / chain guards (suppressed in spy mode — quotes still work) */}
              {isSpyMode && <SpyModeNotice />}
              {!isSpyMode && !account ? (
                <div className="w-full flex justify-center">
                  <WalletConnect />
                </div>
              ) : !isSpyMode && isWrongChain ? (
                <button
                  type="button"
                  className="btn btn-warning btn-sm w-full"
                  onClick={() => syncChain(Number(chainId))}
                >
                  Switch Wallet Chain
                </button>
              ) : (
                <>
                  {activeOperation === 'Loop' && <LoopAction {...actionProps} />}
                  {activeOperation === 'ColSwap' && <ColSwapAction {...actionProps} />}
                  {activeOperation === 'DebtSwap' && <DebtSwapAction {...actionProps} />}
                  {activeOperation === 'Close' && <CloseAction {...actionProps} />}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

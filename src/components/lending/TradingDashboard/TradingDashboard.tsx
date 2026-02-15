import React, { useCallback, useMemo, useState } from 'react'
import { lenderDisplayNameFull } from '@1delta/lib-utils'
import type { LenderData, PoolDataItem } from '../../../hooks/lending/usePoolData'
import type {
  UserDataResult,
  UserPositionEntry,
  UserSubAccount,
} from '../../../hooks/lending/useUserData'
import { useTokenBalances } from '../../../hooks/lending/useTokenBalances'
import { useSyncChain } from '../../../hooks/useSyncChain'
import { SearchableSelect, type SearchableSelectOption } from '../SearchableSelect'
import { WalletConnect } from '../../connect'
import { computeLenderTvl } from '../../../utils/format'
import { TradingMarketTable } from './TradingMarketTable'
import { LoopAction } from './actions/LoopAction'
import { ColSwapAction } from './actions/ColSwapAction'
import { DebtSwapAction } from './actions/DebtSwapAction'
import { CloseAction } from './actions/CloseAction'
import type { TradingOperation, SelectedPool, TableHighlight } from './types'
import { YourPositions, type PositionSummary } from '../YourPositions'
import { useIsMobile } from '../../../hooks/useIsMobile'

interface Props {
  lenderData: LenderData | undefined
  userData: UserDataResult
  chainId: string
  account?: string
  isPublicDataLoading: boolean
  isUserDataLoading: boolean
}

const OPERATIONS: TradingOperation[] = ['Loop', 'ColSwap', 'DebtSwap', 'Close']
const OP_LABELS: Record<TradingOperation, string> = {
  Loop: 'Loop',
  ColSwap: 'Col. Swap',
  DebtSwap: 'Debt Swap',
  Close: 'Close',
}

export function TradingDashboard({
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

  const [selectedLender, setSelectedLender] = useState('')
  const [selectedSubAccountId, setSelectedSubAccountId] = useState<string | null>(null)
  const [activeOperation, setActiveOperation] = useState<TradingOperation>('Loop')
  const [selectedPools, setSelectedPools] = useState<SelectedPool[]>([])
  const [showMobileAction, setShowMobileAction] = useState(false)

  // Lender balances for sorting
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

  const lenderOptions: SearchableSelectOption[] = lenders.map((l) => ({
    value: l,
    label: lenderDisplayNameFull(l),
    indicator: lenderBalances.has(l) ? '\u25CF ' : undefined,
  }))

  // Auto-select first lender
  React.useEffect(() => {
    if (lenders.length > 0 && !lenders.includes(selectedLender)) {
      setSelectedLender(lenders[0])
    }
  }, [lenders, selectedLender])

  // Sub-accounts
  const subAccounts: UserSubAccount[] = useMemo(() => {
    if (!selectedLender || !userData.raw) return []
    const entry = userData.raw.find((e) => e.chainId === chainId && e.lender === selectedLender)
    return entry?.data ?? []
  }, [userData, chainId, selectedLender])

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

  const poolAssetAddresses = useMemo(
    () => [...new Set(allPools.map((p) => p.underlying))],
    [allPools]
  )

  const { balances: walletBalances } = useTokenBalances({
    chainId,
    account,
    assets: poolAssetAddresses,
  })

  // User positions scoped to selected sub-account, keyed by marketUid
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
      if (pos && (Number(pos.deposits) > 0 || Number(pos.debt) > 0)) {
        result.push({ position: pos, pool })
      }
    }
    return result
  }, [allPools, userPositions])

  // Table highlights from action panel's pool selections
  const tableHighlights: TableHighlight[] = useMemo(
    () => selectedPools.map((sp) => ({ marketUid: sp.pool.marketUid, role: sp.role })),
    [selectedPools]
  )

  const handleLenderChange = (lender: string) => {
    setSelectedLender(lender)
    setSelectedSubAccountId(null)
    setSelectedPools([])
  }

  const handlePoolSelectionChange = useCallback((selections: SelectedPool[]) => {
    setSelectedPools(selections)
  }, [])

  if (isPublicDataLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  const actionProps = {
    allPools,
    userPositions,
    walletBalances,
    selectedLender,
    chainId,
    account,
    accountId: selectedSubAccountId ?? undefined,
    onPoolSelectionChange: handlePoolSelectionChange,
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

      {/* User positions + sub-account selector */}
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
        />
      )}

      {/* Two column: Market table + Action panel */}
      <div className="flex gap-4 items-start">
        {/* Left: Market table (read-only, highlights driven by action panel) */}
        <div className="flex-1 min-w-0">
          <TradingMarketTable
            pools={allPools}
            userPositions={userPositions}
            highlights={tableHighlights}
          />
        </div>

        {/* Right: Action panel — desktop only */}
        <div className="hidden md:block w-96 shrink-0 rounded-box border border-base-300 p-3 space-y-3 sticky top-4">
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

          {/* Wallet / chain guards */}
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
              {activeOperation === 'Loop' && <LoopAction {...actionProps} />}
              {activeOperation === 'ColSwap' && <ColSwapAction {...actionProps} />}
              {activeOperation === 'DebtSwap' && <DebtSwapAction {...actionProps} />}
              {activeOperation === 'Close' && <CloseAction {...actionProps} />}
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

              {/* Wallet / chain guards */}
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

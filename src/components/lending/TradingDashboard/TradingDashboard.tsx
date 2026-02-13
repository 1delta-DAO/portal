import React, { useCallback, useMemo, useState } from 'react'
import { lenderDisplayNameFull } from '@1delta/lib-utils'
import type { LenderData, PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserDataResult, UserPositionEntry, UserSubAccount } from '../../../hooks/lending/useUserData'
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
import { CollateralToggle } from '../UserTable'
import { useIsMobile } from '../../../hooks/useIsMobile'

interface Props {
  lenderData: LenderData | undefined
  userData: UserDataResult
  chainId: string
  account?: string
  isPublicDataLoading: boolean
  isUserDataLoading: boolean
}

function abbreviateUsd(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '$0'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(2)}`
}

function formatUsd(v: number) {
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1000 ? 2 : 0 })
}

function formatTokenAmount(v: number | string): string {
  const num = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(num) || num === 0) return '0'
  if (num < 0.0001) return '<0.0001'
  if (num < 1) return num.toFixed(6)
  if (num < 1000) return num.toFixed(4)
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const OPERATIONS: TradingOperation[] = ['Loop', 'ColSwap', 'DebtSwap', 'Close']
const OP_LABELS: Record<TradingOperation, string> = {
  Loop: 'Loop',
  ColSwap: 'Col. Swap',
  DebtSwap: 'Debt Swap',
  Close: 'Close',
}

export function TradingDashboard({ lenderData, userData, chainId, account, isPublicDataLoading, isUserDataLoading }: Props) {
  const { syncChain, currentChainId } = useSyncChain()
  const isWrongChain = !!account && currentChainId !== Number(chainId)
  const isMobile = useIsMobile()

  // Lender selection
  const allLenderKeys = useMemo(
    () => Object.keys(lenderData ?? {}),
    [lenderData]
  )

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
      const total = entry.totalDepositsUSD + entry.totalDebtUSD
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
    const entry = userData.raw.find(e => e.chainId === chainId && e.lender === selectedLender)
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
    () => subAccounts.find(s => s.accountId === selectedSubAccountId) ?? null,
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

  const { balances: walletBalances } = useTokenBalances({ chainId, account, assets: poolAssetAddresses })

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
  const lenderSummary = useMemo(() => {
    if (!activeSubAccount) return null
    const bd = activeSubAccount.balanceData
    if (bd.deposits === 0 && bd.debt === 0) return null
    return { deposits: bd.deposits, debt: bd.debt, nav: bd.nav, health: activeSubAccount.health }
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
    () => selectedPools.map(sp => ({ marketUid: sp.pool.marketUid, role: sp.role })),
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

          {/* Summary stats */}
          {lenderSummary && (
            <div className="flex gap-4 items-center text-xs flex-wrap">
              <span>Deposits: <span className="font-semibold text-success">${formatUsd(lenderSummary.deposits)}</span></span>
              <span>Debt: <span className="font-semibold text-error">${formatUsd(lenderSummary.debt)}</span></span>
              <span>Net: <span className="font-semibold">${formatUsd(lenderSummary.nav)}</span></span>
              {lenderSummary.health != null && (
                <div className="flex items-center gap-1">
                  <span>Health:</span>
                  <span className={`badge badge-sm font-semibold ${
                    lenderSummary.health < 1.1 ? 'badge-error' : lenderSummary.health < 1.3 ? 'badge-warning' : 'badge-success'
                  }`}>
                    {lenderSummary.health.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Position cards */}
          {activePositions.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {activePositions.map(({ position, pool }) => (
                <div
                  key={pool.marketUid}
                  className="flex items-center gap-2 p-2 rounded-lg bg-base-200/50"
                >
                  <img
                    src={pool.asset.logoURI}
                    width={32}
                    height={32}
                    alt={pool.asset.symbol}
                    className="rounded-full object-cover w-8 h-8 shrink-0"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
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
                  {Number(position.deposits) > 0 && account && (
                    <div className="flex flex-col items-center shrink-0">
                      <span className="text-[9px] text-base-content/50 leading-tight">Coll.</span>
                      <CollateralToggle
                        marketUid={pool.marketUid}
                        enabled={position.collateralEnabled}
                        account={account}
                        chainId={chainId}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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
                onClick={() => { setActiveOperation(op); setSelectedPools([]) }}
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
            <button type="button" className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={() => setShowMobileAction(false)}>✕</button>

            <div className="space-y-3">
              {/* Operation tabs */}
              <div role="tablist" className="tabs tabs-boxed tabs-xs">
                {OPERATIONS.map((op) => (
                  <button
                    key={op}
                    type="button"
                    role="tab"
                    className={`tab ${activeOperation === op ? 'tab-active' : ''}`}
                    onClick={() => { setActiveOperation(op); setSelectedPools([]) }}
                  >
                    {OP_LABELS[op]}
                  </button>
                ))}
              </div>

              {/* Wallet / chain guards */}
              {!account ? (
                <div className="w-full flex justify-center"><WalletConnect /></div>
              ) : isWrongChain ? (
                <button type="button" className="btn btn-warning btn-sm w-full" onClick={() => syncChain(Number(chainId))}>Switch Wallet Chain</button>
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

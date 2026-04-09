// src/components/LenderTab.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useChains } from '../../hooks/useChains'
import { UserLenderPositionsTable } from './UserTable'
import { UserAssetsTable } from './UserAssetsTable'
import { LendingPoolsTable } from './MarketsView'
import { ChainFilterSelect } from './ChainFilter'
import { useUserData } from '../../hooks/lending/useUserData'
import { useLendingLatest, useLenders } from '../../hooks/lending/usePoolData'
import { useLendingBalances } from '../../hooks/lending/useLendingBalances'
import { useTokenLists } from '../../hooks/useTokenLists'
import { LendingDashboard } from './LendingDashboard'
import { TradingDashboard } from './TradingDashboard'
import { SpotSwapPanel } from '../swap/SpotSwapPanel'
import { tabFromSlug, slugToLender, buildPath } from '../../utils/routes'

export type SubTab = 'earn' | 'lending' | 'trading' | 'swap'

export function LenderTab() {
  const { address: account } = useAccount()
  const { chains, isLoading: isChainsLoading } = useChains()
  const navigate = useNavigate()
  const { tab: tabSlug, chainId: chainIdParam, lender: lenderParam } = useParams()

  // Derive state from URL params
  const activeTab = tabFromSlug(tabSlug)
  const selectedChain = chainIdParam || localStorage.getItem('selectedChainId') || '1'
  const initialLender = lenderParam ? slugToLender(lenderParam) : ''

  const setActiveTab = useCallback(
    (tab: SubTab) => {
      navigate(buildPath(tab, selectedChain, initialLender || undefined), { replace: true })
    },
    [navigate, selectedChain, initialLender]
  )

  const setSelectedChain = useCallback(
    (chain: string) => {
      localStorage.setItem('selectedChainId', chain)
      // Reset lender when changing chain since lenders differ per chain
      navigate(buildPath(activeTab, chain), { replace: true })
    },
    [navigate, activeTab]
  )

  const setSelectedLender = useCallback(
    (lender: string) => {
      navigate(buildPath(activeTab, selectedChain, lender), { replace: true })
    },
    [navigate, activeTab, selectedChain]
  )

  const effectiveChainId = selectedChain

  // Sub-tab within "earn": 'assets' | 'positions'
  const [earnSubTab, setEarnSubTab] = useState<'assets' | 'positions'>('assets')

  // Filter markets to owned assets toggle
  const [filterOwned, setFilterOwned] = useState(false)

  // Single-asset filter (click a row in UserAssetsTable)
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null)

  const chainsReady = !isChainsLoading

  // Light enumeration of lenders (key + name + tvlUsd) — drives the dropdown
  // and tells useLendingLatest which lender to fetch full data for.
  const { lenders: lenderSummaries, isLendersLoading } = useLenders(effectiveChainId, chainsReady)

  // Resolve the *active* lender for the heavy per-market fetch:
  //   1. URL value if it exists in the current chain's enumeration
  //   2. otherwise the first summary entry (already tvl-desc sorted by the server)
  //   3. otherwise empty string → useLendingLatest stays idle
  //
  // We deliberately don't keep this in component state. The URL is the source
  // of truth, and `setSelectedLender` (defined above) writes to the URL —
  // which re-renders us with a fresh `initialLender`. Keeping it derived
  // avoids the previous "selection feedback loop" between local state and the
  // URL sync effect that the old useLenderSelector had to work around.
  const activeLender = useMemo(() => {
    const summaryKeys = lenderSummaries?.map((l) => l.lenderInfo.key) ?? []
    if (initialLender && summaryKeys.includes(initialLender)) return initialLender
    return summaryKeys[0] ?? ''
  }, [initialLender, lenderSummaries])

  // When the URL has no lender (or has a stale one) and the summaries land,
  // push the auto-selected lender into the URL exactly once per chain so the
  // user can deep-link back to the same view. We guard with a ref to avoid
  // overwriting a fresh user selection that's mid-flight as React batches.
  const autoSelectedForChain = useRef<string | null>(null)
  useEffect(() => {
    if (!activeLender) return
    if (initialLender === activeLender) return
    // Only auto-write the URL if the URL is empty or holds a now-stale key.
    const summaryKeys = lenderSummaries?.map((l) => l.lenderInfo.key) ?? []
    const urlIsStale = !initialLender || !summaryKeys.includes(initialLender)
    if (!urlIsStale) return
    if (autoSelectedForChain.current === effectiveChainId) return
    autoSelectedForChain.current = effectiveChainId
    setSelectedLender(activeLender)
  }, [activeLender, initialLender, lenderSummaries, effectiveChainId, setSelectedLender])

  // Reset the auto-select guard whenever the chain changes so a new chain
  // gets its own first-load auto-selection.
  useEffect(() => {
    autoSelectedForChain.current = null
  }, [effectiveChainId])

  // Heavy per-market data — now scoped to the SINGLE active lender. The
  // `useLendingLatest` hook still chunks internally (this just becomes
  // one chunk of one), but the network round-trip drops from O(lenders)
  // to O(1) per chain, which is the real efficiency win.
  const lenderKeysToFetch = useMemo(() => (activeLender ? [activeLender] : []), [activeLender])
  const { lenderData, lenderInfoMap, isPublicDataLoading } = useLendingLatest(
    effectiveChainId,
    lenderKeysToFetch,
    chainsReady
  )
  const { userData, isUserDataLoading, error, refetch } = useUserData({
    chainId: effectiveChainId,
    account,
    enabled: chainsReady,
  })
  const { data: tokens } = useTokenLists(chainsReady ? effectiveChainId : undefined)
  const {
    balances: lendingBalances,
    isLoading: isLendingBalancesLoading,
    error: lendingBalancesError,
  } = useLendingBalances({ chainId: effectiveChainId, account, enabled: chainsReady })

  const isLoading = isLendersLoading || isPublicDataLoading || isUserDataLoading

  // Build external asset filter: single clicked asset takes precedence, then owned filter
  const externalAssetFilter = useMemo(() => {
    if (selectedAsset) return selectedAsset
    if (!filterOwned || lendingBalances.length === 0) return ''
    return lendingBalances.map((b) => b.address.toLowerCase()).join(',')
  }, [selectedAsset, filterOwned, lendingBalances])

  if (isChainsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-base-content/50">
        <span className="loading loading-spinner loading-md" />
        <span className="text-sm">Loading chains...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Top bar: chain selector + sub-tabs */}
      <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" className="tabs tabs-bordered">
          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'earn' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('earn')}
          >
            Earn
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'lending' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('lending')}
          >
            Lending
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'trading' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('trading')}
          >
            Looping
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'swap' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('swap')}
          >
            Swap
          </button>
        </div>

        <div className="flex justify-end">
          <ChainFilterSelect chains={chains} value={selectedChain} onChange={setSelectedChain} />
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'earn' && (
        <div className="space-y-3 sm:space-y-4">
          {account && (
            <div className="space-y-3">
              <div className="flex items-center gap-1 bg-base-200 rounded-lg p-1 w-fit">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    earnSubTab === 'assets'
                      ? 'bg-base-100 shadow-sm text-base-content'
                      : 'text-base-content/60 hover:text-base-content'
                  }`}
                  onClick={() => setEarnSubTab('assets')}
                >
                  Your Assets
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    earnSubTab === 'positions'
                      ? 'bg-base-100 shadow-sm text-base-content'
                      : 'text-base-content/60 hover:text-base-content'
                  }`}
                  onClick={() => setEarnSubTab('positions')}
                >
                  Your Lending Positions
                </button>
              </div>

              {earnSubTab === 'assets' && (
                <UserAssetsTable
                  balances={lendingBalances}
                  isLoading={isLendingBalancesLoading}
                  error={lendingBalancesError}
                  tokens={tokens}
                  filterOwned={filterOwned}
                  onFilterOwnedChange={setFilterOwned}
                  selectedAsset={selectedAsset}
                  onAssetClick={(address) => {
                    const addr = address.toLowerCase()
                    setSelectedAsset((prev) => (prev === addr ? null : addr))
                  }}
                />
              )}

              {earnSubTab === 'positions' && (
                <UserLenderPositionsTable
                  account={account}
                  chainId={effectiveChainId}
                  userData={userData}
                  lenderInfoMap={lenderInfoMap}
                  isLoading={isLoading}
                  error={error}
                  refetch={refetch}
                />
              )}
            </div>
          )}
          <LendingPoolsTable
            chainId={effectiveChainId}
            account={account}
            externalAssetFilter={externalAssetFilter}
            userData={userData}
          />
        </div>
      )}

      {activeTab === 'lending' && (
        <LendingDashboard
          lenderSummaries={lenderSummaries}
          lenderData={lenderData}
          lenderInfoMap={lenderInfoMap}
          userData={userData}
          chainId={effectiveChainId}
          account={account}
          isPublicDataLoading={isPublicDataLoading}
          isUserDataLoading={isUserDataLoading}
          selectedLender={activeLender}
          onLenderChange={setSelectedLender}
        />
      )}

      {activeTab === 'trading' && (
        <TradingDashboard
          lenderSummaries={lenderSummaries}
          lenderData={lenderData}
          lenderInfoMap={lenderInfoMap}
          userData={userData}
          chainId={effectiveChainId}
          account={account}
          isPublicDataLoading={isPublicDataLoading}
          isUserDataLoading={isUserDataLoading}
          selectedLender={activeLender}
          onLenderChange={setSelectedLender}
        />
      )}

      {activeTab === 'swap' && <SpotSwapPanel chainId={effectiveChainId} />}
    </div>
  )
}

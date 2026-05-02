import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSpyAccount } from '../../contexts/SpyMode'
import { useChains } from '../../hooks/useChains'
import { ChainFilterSelect } from './shared/ChainFilter'
import { useUserData } from '../../hooks/lending/useUserData'
import { useLendingLatest, useLenders } from '../../hooks/lending/usePoolData'
import { useLendingBalances } from '../../hooks/lending/useLendingBalances'
import { useTokenLists } from '../../hooks/useTokenLists'
import { EarnTab } from './tabs/earn'
import { LendingDashboard } from './tabs/lending'
import { TradingDashboard } from './tabs/trading'
import { OptimizerTab } from './tabs/optimizer'
import { SpotSwapPanel } from '../swap/SpotSwapPanel'
import { tabFromSlug, slugToLender, buildPath } from '../../utils/routes'

const OPTIMIZER_ENABLED = import.meta.env.VITE_OPTIMIZER_ENABLED === 'true'

export type SubTab = 'earn' | 'lending' | 'trading' | 'swap' | 'optimize'

export function LenderTab() {
  const { address: account } = useSpyAccount()
  const { chains, isLoading: isChainsLoading } = useChains()
  const navigate = useNavigate()
  const { tab: tabSlug, chainId: chainIdParam, lender: lenderParam } = useParams()

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
  const chainsReady = !isChainsLoading

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
  // user can deep-link back to the same view.
  const autoSelectedForChain = useRef<string | null>(null)
  useEffect(() => {
    if (!activeLender) return
    if (initialLender === activeLender) return
    const summaryKeys = lenderSummaries?.map((l) => l.lenderInfo.key) ?? []
    const urlIsStale = !initialLender || !summaryKeys.includes(initialLender)
    if (!urlIsStale) return
    if (autoSelectedForChain.current === effectiveChainId) return
    autoSelectedForChain.current = effectiveChainId
    setSelectedLender(activeLender)
  }, [activeLender, initialLender, lenderSummaries, effectiveChainId, setSelectedLender])

  useEffect(() => {
    autoSelectedForChain.current = null
  }, [effectiveChainId])

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

          {OPTIMIZER_ENABLED && (
            <button
              type="button"
              role="tab"
              className={`tab tab-sm ${activeTab === 'optimize' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('optimize')}
            >
              Optimizer
            </button>
          )}

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

      {activeTab === 'earn' && (
        <EarnTab
          account={account}
          chainId={effectiveChainId}
          tokens={tokens}
          userData={userData}
          lenderInfoMap={lenderInfoMap}
          lendingBalances={lendingBalances}
          isLendingBalancesLoading={isLendingBalancesLoading}
          lendingBalancesError={lendingBalancesError}
          isLoading={isLoading}
          userDataError={error}
          refetchUserData={refetch}
        />
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

      {OPTIMIZER_ENABLED && activeTab === 'optimize' && <OptimizerTab chainId={effectiveChainId} />}

      {activeTab === 'swap' && <SpotSwapPanel chainId={effectiveChainId} />}
    </div>
  )
}

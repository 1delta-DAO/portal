import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSpyAccount } from '../../contexts/SpyMode'
import { useRiskMode } from '../../contexts/RiskMode'
import { useChains } from '../../hooks/useChains'
import { ChainFilterSelect, ChainMultiSelect } from './shared/ChainFilter'
import { RiskSelect } from './shared/RiskSelect'
import { useUserData } from '../../hooks/lending/useUserData'
import { useLendingLatest, useLenders } from '../../hooks/lending/usePoolData'
import type { LenderInfoMap } from '../../sdk/lending-helper/marketTypes'
import { useLendingBalancesMultiChain } from '../../hooks/lending/useLendingBalances'
import { useTokenListsMultiChain } from '../../hooks/useTokenLists'
import { tabFromSlug, slugToLender, buildPath, TAB_CHAIN_MODE } from '../../utils/routes'
import { useChainSelection, usePersistChainSelection } from '../../hooks/useChainSelection'
import { Badge } from '../common/Badge'

// Tab panels are code-split: only the tab you open is downloaded. This matters
// most for the flag-gated ones — `lazy` doesn't call the importer until the
// component actually renders, and the flag checks below sit *outside* the JSX,
// so a build with the Optimizer disabled never requests its chunk at all.
// Keep the flag test and the lazy element together when adding a tab.
const EarnTab = lazy(() => import('./tabs/earn').then((m) => ({ default: m.EarnTab })))
const UnifiedEarnTab = lazy(() =>
  import('./tabs/unified').then((m) => ({ default: m.UnifiedEarnTab }))
)
const LendingDashboard = lazy(() =>
  import('./tabs/lending').then((m) => ({ default: m.LendingDashboard }))
)
const TradingDashboard = lazy(() =>
  import('./tabs/trading').then((m) => ({ default: m.TradingDashboard }))
)
const OptimizerTab = lazy(() =>
  import('./tabs/optimizer').then((m) => ({ default: m.OptimizerTab }))
)
const SpotSwapPanel = lazy(() =>
  import('../swap/SpotSwapPanel').then((m) => ({ default: m.SpotSwapPanel }))
)
const XChainSwapPanel = lazy(() =>
  import('../swap/XChainSwapPanel').then((m) => ({ default: m.XChainSwapPanel }))
)

import { OPTIMIZER_ENABLED, BRIDGE_UI_ENABLED, UNIFIED_EARN_ENABLED } from '../../config/flags'

export type SubTab = 'earn' | 'unified' | 'lending' | 'trading' | 'swap' | 'xswap' | 'optimize'

/**
 * Tabs this build has turned off.
 *
 * A tab is hidden in THREE places — the button, the content, and this set —
 * and the third is the one that is easy to forget: without it a deep link to a
 * disabled tab keeps `activeTab` pointing at it, so the button is gone, the
 * content is gated off, and the user gets a blank page under a tab bar with
 * nothing selected. `optimize` had exactly that gap.
 */
const DISABLED_TABS: ReadonlySet<SubTab> = new Set<SubTab>([
  ...(BRIDGE_UI_ENABLED ? [] : (['xswap'] as SubTab[])),
  ...(UNIFIED_EARN_ENABLED ? [] : (['unified'] as SubTab[])),
  ...(OPTIMIZER_ENABLED ? [] : (['optimize'] as SubTab[])),
])

/** Stable empty list so the token-list effect doesn't re-run on every render. */
const EMPTY_CHAINS: string[] = []

export function LenderTab() {
  const { address: account } = useSpyAccount()
  const { maxRiskScore, setMaxRiskScore } = useRiskMode()
  const { chains, isLoading: isChainsLoading } = useChains()
  const navigate = useNavigate()
  const { tab: tabSlug, chainId: chainIdParam, lender: lenderParam } = useParams()

  // Deep links to a disabled tab fall back to the default tab instead of
  // rendering an empty content area.
  const rawTab = tabFromSlug(tabSlug)
  const activeTab = DISABLED_TABS.has(rawTab) ? 'earn' : rawTab
  const initialLender = lenderParam ? slugToLender(lenderParam) : ''

  // Chain selection is per-tab: Earn and Optimizer browse across chains, the
  // position-management tabs stay on one, and the bridge tab hides the
  // selector entirely (its panel picks a chain per side).
  const {
    chainIds,
    primaryChainId,
    mode: chainMode,
    isHidden: chainSelectorHidden,
    maxChains,
  } = useChainSelection(activeTab, chainIdParam)
  const persistChains = usePersistChainSelection()
  const isMultiChain = chainMode === 'multi'

  // Mirror the resolved selection into localStorage so the *other* kind of tab
  // restores it later. Done in an effect rather than in the setters below
  // because the selection also resolves from storage on a fresh deep link.
  useEffect(() => {
    persistChains(chainIds, chainMode)
    // chainIds is rebuilt per render; the join is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainIds.join(','), chainMode, persistChains])

  const setActiveTab = useCallback(
    (tab: SubTab) => {
      // Narrow the selection to what the target tab can actually show before
      // writing it to the URL, so a single-chain tab entered from a 3-chain
      // Earn view doesn't end up with a URL advertising chains it isn't
      // rendering (which would then be what the user copies and shares).
      const next = TAB_CHAIN_MODE[tab] === 'multi' ? chainIds : chainIds.slice(0, 1)
      navigate(buildPath(tab, next, initialLender || undefined), { replace: true })
    },
    [navigate, chainIds, initialLender]
  )

  const setSelectedChains = useCallback(
    (next: string[]) => {
      if (next.length === 0) return
      persistChains(next, chainMode)
      // The lender segment is chain-scoped, so a chain change drops it and
      // lets the auto-select effect below pick a valid one for the new chain.
      navigate(buildPath(activeTab, next), { replace: true })
    },
    [navigate, activeTab, chainMode, persistChains]
  )

  const setSelectedChain = useCallback(
    (chain: string) => setSelectedChains([chain]),
    [setSelectedChains]
  )

  const setSelectedLender = useCallback(
    (lender: string) => {
      navigate(buildPath(activeTab, chainIds, lender), { replace: true })
    },
    [navigate, activeTab, chainIds]
  )

  const effectiveChainId = primaryChainId
  const chainsReady = !isChainsLoading

  // Two separate gates, because the two fetches have different appetites.
  //
  // The lender *enumeration* is cheap and every lending-ish tab needs it (Earn
  // and the Optimizer render lender names/logos on position rows). It takes a
  // `chains` CSV, so it covers the whole selection in one request — and the
  // shared query key means the Optimizer's own copy dedupes into this one.
  const needsLenderInfo =
    activeTab === 'earn' ||
    activeTab === 'lending' ||
    activeTab === 'trading' ||
    activeTab === 'optimize'

  // The heavy per-market fetch is single-chain only: `useLendingLatest` keys
  // its result by lender alone, so two chains' AAVE_V3 would overwrite each
  // other. Only Lending and Looping render it at all.
  const singleChainFetchEnabled =
    chainsReady && !isMultiChain && (activeTab === 'lending' || activeTab === 'trading')

  const { lenders: lenderSummaries, isLendersLoading } = useLenders(
    chainIds.join(','),
    chainsReady && needsLenderInfo
  )

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
    singleChainFetchEnabled
  )
  // The heavy fetch above is scoped to the single active lender, so its
  // lenderInfoMap has exactly one entry. The earn positions table renders
  // names for EVERY lender the user holds — merge in the full-chain
  // enumeration (summaries) so those lookups don't fall back to enum keys.
  const fullLenderInfoMap = useMemo<LenderInfoMap>(() => {
    const map: LenderInfoMap = {}
    for (const s of lenderSummaries ?? []) {
      if (s.lenderInfo?.key) map[s.lenderInfo.key] = s.lenderInfo
    }
    return { ...map, ...lenderInfoMap }
  }, [lenderSummaries, lenderInfoMap])
  // Scope the user-positions fetch to a single lender on the lending/looping
  // tabs (the UI only ever shows one lender's data there). Earn aggregates
  // across all lenders, so it keeps the unfiltered fetch.
  const userDataLenders = useMemo(
    () =>
      (activeTab === 'lending' || activeTab === 'trading') && activeLender
        ? [activeLender]
        : undefined,
    [activeTab, activeLender]
  )
  // Positions span the whole selection. `/lending/user-positions` takes a
  // `chains` CSV natively, so this is one request whether the tab shows one
  // chain or five; every entry is tagged with its own `chainId`.
  const { userData, isUserDataLoading, error, refetch } = useUserData({
    chainIds,
    account,
    enabled: chainsReady && needsLenderInfo,
    lenders: userDataLenders,
  })
  // Token lists and wallet balances are Earn-only: the Swap and Cross-Chain
  // panels load their own, and the position tabs read metadata off the market
  // payload. Balances in particular are one request per chain.
  const earnDataEnabled = chainsReady && activeTab === 'earn'
  const { data: tokensByChain } = useTokenListsMultiChain(earnDataEnabled ? chainIds : EMPTY_CHAINS)
  const {
    balances: lendingBalances,
    isLoading: isLendingBalancesLoading,
    error: lendingBalancesError,
    failedChains: balanceFailedChains,
  } = useLendingBalancesMultiChain({ chainIds, account, enabled: earnDataEnabled })

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

          {UNIFIED_EARN_ENABLED && (
            <button
              type="button"
              role="tab"
              className={`tab tab-sm ${activeTab === 'unified' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('unified')}
            >
              Unified
            </button>
          )}

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

          {BRIDGE_UI_ENABLED && (
            <button
              type="button"
              role="tab"
              className={`tab tab-sm gap-1.5 ${activeTab === 'xswap' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('xswap')}
            >
              Cross-Chain
              <Badge tone="info">Beta</Badge>
            </button>
          )}
        </div>

        <div className="flex justify-end items-center gap-2">
          <RiskSelect value={maxRiskScore} onChange={setMaxRiskScore} />
          {/* The bridge tab picks a chain per side inside its own panel, so a
              global selector there would be a competing source of truth. */}
          {!chainSelectorHidden &&
            (isMultiChain ? (
              <ChainMultiSelect
                chains={chains}
                values={chainIds}
                onChange={setSelectedChains}
                maxChains={maxChains}
              />
            ) : (
              <ChainFilterSelect
                chains={chains}
                value={effectiveChainId}
                onChange={setSelectedChain}
              />
            ))}
        </div>
      </div>

      <Suspense fallback={<TabFallback />}>
      {activeTab === 'earn' && (
        <EarnTab
          account={account}
          chainIds={chainIds}
          tokensByChain={tokensByChain}
          userData={userData}
          lenderInfoMap={fullLenderInfoMap}
          lendingBalances={lendingBalances}
          isLendingBalancesLoading={isLendingBalancesLoading}
          lendingBalancesError={lendingBalancesError}
          balanceFailedChains={balanceFailedChains}
          isLoading={isLoading}
          userDataError={error}
          refetchUserData={refetch}
        />
      )}

      {UNIFIED_EARN_ENABLED && activeTab === 'unified' && (
        <UnifiedEarnTab chainIds={chainIds} enabled={chainsReady} />
      )}

      {activeTab === 'lending' && (
        <LendingDashboard
          lenderSummaries={lenderSummaries}
          lenderData={lenderData}
          lenderInfoMap={fullLenderInfoMap}
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
          lenderInfoMap={fullLenderInfoMap}
          userData={userData}
          chainId={effectiveChainId}
          account={account}
          isPublicDataLoading={isPublicDataLoading}
          isUserDataLoading={isUserDataLoading}
          selectedLender={activeLender}
          onLenderChange={setSelectedLender}
        />
      )}

      {OPTIMIZER_ENABLED && activeTab === 'optimize' && (
        <OptimizerTab
          chainIds={chainIds}
          account={account}
          userData={userData}
          isUserDataLoading={isUserDataLoading}
          userDataError={error}
          refetchUserData={refetch}
        />
      )}

      {activeTab === 'swap' && <SpotSwapPanel chainId={effectiveChainId} />}

      {BRIDGE_UI_ENABLED && activeTab === 'xswap' && <XChainSwapPanel chainId={effectiveChainId} />}
      </Suspense>
    </div>
  )
}

/** Shown while a tab's chunk is in flight. Matches the chains-loading state
 *  above so switching tabs doesn't flash a different-looking spinner. */
function TabFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-base-content/50">
      <span className="loading loading-spinner loading-md" />
      <span className="text-sm">Loading…</span>
    </div>
  )
}

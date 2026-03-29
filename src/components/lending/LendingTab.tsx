// src/components/LenderTab.tsx
import { useCallback, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useChains } from '../../hooks/useChains'
import { UserLenderPositionsTable } from './UserTable'
import { UserAssetsTable } from './UserAssetsTable'
import { LendingPoolsTable } from './MarketsView'
import { ChainFilterSelect } from './ChainFilter'
import { useUserData } from '../../hooks/lending/useUserData'
import { useMarginPublicData } from '../../hooks/lending/usePoolData'
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
  const selectedChain = chainIdParam || '1'
  const initialLender = lenderParam ? slugToLender(lenderParam) : ''

  const setActiveTab = useCallback(
    (tab: SubTab) => {
      navigate(buildPath(tab, selectedChain, initialLender || undefined), { replace: true })
    },
    [navigate, selectedChain, initialLender]
  )

  const setSelectedChain = useCallback(
    (chain: string) => {
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
  const { lenderData, lenderInfoMap, isPublicDataLoading } = useMarginPublicData(effectiveChainId, chainsReady)
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

  const isLoading = isPublicDataLoading || isUserDataLoading

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
    <div className="space-y-4">
      {/* Top bar: chain selector + sub-tabs */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
        <div className="space-y-4">
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
          lenderData={lenderData}
          lenderInfoMap={lenderInfoMap}
          userData={userData}
          chainId={effectiveChainId}
          account={account}
          isPublicDataLoading={isPublicDataLoading}
          isUserDataLoading={isUserDataLoading}
          initialLender={initialLender}
          onLenderChange={setSelectedLender}
        />
      )}

      {activeTab === 'trading' && (
        <TradingDashboard
          lenderData={lenderData}
          lenderInfoMap={lenderInfoMap}
          userData={userData}
          chainId={effectiveChainId}
          account={account}
          isPublicDataLoading={isPublicDataLoading}
          isUserDataLoading={isUserDataLoading}
          initialLender={initialLender}
          onLenderChange={setSelectedLender}
        />
      )}

      {activeTab === 'swap' && (
        <SpotSwapPanel chainId={effectiveChainId} />
      )}
    </div>
  )
}

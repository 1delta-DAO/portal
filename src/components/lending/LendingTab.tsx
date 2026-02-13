// src/components/LenderTab.tsx
import React, { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { useChains } from '../../hooks/useChains'
import { UserLenderPositionsTable } from './UserTable'
import { UserAssetsTable } from './UserAssetsTable'
import { LendingPoolsTable } from './MarketsView'
import { ChainFilterSelect } from './ChainFilter'
import { LenderOperationsBuilder } from './LenderOperationsBuilder'
import { useUserData } from '../../hooks/lending/useUserData'
import { useMarginPublicData } from '../../hooks/lending/usePoolData'
import { useLendingBalances } from '../../hooks/lending/useLendingBalances'
import { useTokenLists } from '../../hooks/useTokenLists'
import { useMainPrices } from '../../hooks/prices/useMainPrices'
import { LendingDashboard } from './LendingDashboard'
import { TradingDashboard } from './TradingDashboard'

type SubTab = 'earn' | 'lending' | 'operations' | 'trading'

const SHOW_OPERATIONS_TAB = false

export function LenderTab() {
  const { address: account } = useAccount()
  const chains = useChains()

  // shared chain filter state
  const [selectedChain, setSelectedChain] = useState<string>('1')

  // sub-tab state — Earn is the default
  const [activeTab, setActiveTab] = useState<SubTab>('earn')

  const effectiveChainId = selectedChain

  // Sub-tab within "earn": 'assets' | 'positions'
  const [earnSubTab, setEarnSubTab] = useState<'assets' | 'positions'>('assets')

  // Filter markets to owned assets toggle
  const [filterOwned, setFilterOwned] = useState(false)

  const { lenderData, isPublicDataLoading } = useMarginPublicData(effectiveChainId)
  const { userData, isUserDataLoading, error, refetch } = useUserData({
    chainId: effectiveChainId,
    account,
  })
  const { data: prices } = useMainPrices()
  const { data: tokens } = useTokenLists(effectiveChainId)
  const {
    balances: lendingBalances,
    isLoading: isLendingBalancesLoading,
    error: lendingBalancesError,
  } = useLendingBalances({ chainId: effectiveChainId, account })

  const isLoading = isPublicDataLoading || isUserDataLoading

  // Build external asset filter: comma-separated addresses when checkbox is on
  const externalAssetFilter = useMemo(() => {
    if (!filterOwned || lendingBalances.length === 0) return ''
    return lendingBalances.map((b) => b.address.toLowerCase()).join(',')
  }, [filterOwned, lendingBalances])

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

          {SHOW_OPERATIONS_TAB && (
            <button
              type="button"
              role="tab"
              className={`tab tab-sm ${activeTab === 'operations' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('operations')}
            >
              Operations
            </button>
          )}

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'trading' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('trading')}
          >
            Looping
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
                />
              )}

              {earnSubTab === 'positions' && (
                <UserLenderPositionsTable
                  account={account}
                  chainId={effectiveChainId}
                  userData={userData}
                  isLoading={isLoading}
                  error={error}
                  refetch={refetch}
                />
              )}
            </div>
          )}
          <LendingPoolsTable
            chainId={effectiveChainId}
            lenderData={lenderData}
            account={account}
            externalAssetFilter={externalAssetFilter}
            userData={userData}
          />
        </div>
      )}

      {activeTab === 'lending' && (
        <LendingDashboard
          lenderData={lenderData}
          userData={userData}
          chainId={effectiveChainId}
          account={account}
          isPublicDataLoading={isPublicDataLoading}
          isUserDataLoading={isUserDataLoading}
        />
      )}

      {activeTab === 'operations' && (
        <LenderOperationsBuilder
          prices={prices}
          chainId={effectiveChainId}
          userDataResult={userData}
          lenderData={lenderData}
          isLoading={isLoading}
          error={error}
          refetch={refetch}
        />
      )}

      {activeTab === 'trading' && (
        <TradingDashboard
          lenderData={lenderData}
          userData={userData}
          chainId={effectiveChainId}
          account={account}
          isPublicDataLoading={isPublicDataLoading}
          isUserDataLoading={isUserDataLoading}
        />
      )}
    </div>
  )
}

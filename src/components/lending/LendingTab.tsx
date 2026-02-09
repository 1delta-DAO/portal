// src/components/LenderTab.tsx
import React, { useState } from 'react'
import { useAccount } from 'wagmi'
import { getAvailableMarginChainIds } from '@1delta/lib-utils'
import { UserLenderPositionsTable } from './UserTable'
import { LendingPoolsTable } from './PoolsTable'
import { ChainFilterSelect } from './ChainFilter'
import { LenderOperationsBuilder } from './LenderOperationsBuilder'
import { useUserData } from '../../hooks/lending/useUserData'
import { useMarginPublicData } from '../../hooks/lending/usePoolData'
import { useMainPrices } from '../../hooks/prices/useMainPrices'
import { LendingDashboard } from './LendingDashboard'
import { TradingDashboard } from './TradingDashboard'

type SubTab = 'lending' | 'markets' | 'operations' | 'trading'

const chains = getAvailableMarginChainIds()

const SHOW_OPERATIONS_TAB = false

export function LenderTab() {
  const { address: account } = useAccount()

  // shared chain filter state
  const [selectedChain, setSelectedChain] = useState<string>('1')

  // sub-tab state
  const [activeTab, setActiveTab] = useState<SubTab>('lending')

  const effectiveChainId = selectedChain

  const { lenderData, isPublicDataLoading } = useMarginPublicData(effectiveChainId)
  const { userData, isUserDataLoading, error, refetch } = useUserData({
    chainId: effectiveChainId,
    account,
  })
  const { data: prices } = useMainPrices()

  const isLoading = isPublicDataLoading || isUserDataLoading
  // Keep combined flag for tabs that don't support independent loading yet

  return (
    <div className="space-y-4">
      {/* Top bar: chain selector + sub-tabs */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" className="tabs tabs-bordered">
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
            className={`tab tab-sm ${activeTab === 'markets' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('markets')}
          >
            Markets
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

      {activeTab === 'markets' && (
        <div className="space-y-4">
          {account && (
            <UserLenderPositionsTable
              account={account}
              chainId={effectiveChainId}
              userData={userData}
              isLoading={isLoading}
              error={error}
              refetch={refetch}
            />
          )}
          <LendingPoolsTable chainId={effectiveChainId} />
        </div>
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

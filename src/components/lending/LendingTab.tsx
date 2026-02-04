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
import { Loop } from './loop/Loop'
import { Swap } from './swap/Swap'
import { Close } from './close/Close'

type SubTab = 'markets' | 'operations' | 'loop' | 'swap' | 'close'

const chains = getAvailableMarginChainIds()

export function LenderTab() {
  const { address: account } = useAccount()

  // shared chain filter state
  const [selectedChain, setSelectedChain] = useState<string>('1')

  // sub-tab state
  const [activeTab, setActiveTab] = useState<SubTab>('markets')

  const effectiveChainId = selectedChain

  const { lenderData, isPublicDataLoading } = useMarginPublicData(effectiveChainId)
  const { userData, isUserDataLoading, error, refetch } = useUserData({
    chainId: effectiveChainId,
    account,
  })
  const { data: prices } = useMainPrices()

  const isLoading = isPublicDataLoading || isUserDataLoading

  return (
    <div className="space-y-4">
      {/* Top bar: chain selector + sub-tabs */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" className="tabs tabs-bordered">
          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'markets' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('markets')}
          >
            Markets
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'operations' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('operations')}
          >
            Operations
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'loop' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('loop')}
          >
            Loop
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'swap' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('swap')}
          >
            Swap
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'close' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('close')}
          >
            Close
          </button>
        </div>

        <div className="flex justify-end">
          <ChainFilterSelect chains={chains} value={selectedChain} onChange={setSelectedChain} />
        </div>
      </div>

      {/* Tab content */}
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
      {activeTab === 'loop' && (
        <div className="flex justify-center">
          {lenderData && <Loop lenderData={lenderData} chainId={effectiveChainId} />}
        </div>
      )}
      {activeTab === 'swap' && (
        <div className="flex justify-center">
          {lenderData && <Swap lenderData={lenderData} chainId={effectiveChainId} />}
        </div>
      )}
      {activeTab === 'close' && (
        <div className="flex justify-center">
          {lenderData && <Close lenderData={lenderData} chainId={effectiveChainId} />}
        </div>
      )}
    </div>
  )
}

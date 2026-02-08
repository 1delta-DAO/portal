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
import { LendingActionTab } from './LendingActionTab'
import { LendingDashboard } from './LendingDashboard'
import { TradingDashboard } from './TradingDashboard'

type SubTab = 'lending' | 'markets' | 'operations' | 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'trading'

const chains = getAvailableMarginChainIds()

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
            className={`tab tab-sm ${activeTab === 'deposit' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('deposit')}
          >
            Deposit
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'withdraw' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('withdraw')}
          >
            Withdraw
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'borrow' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('borrow')}
          >
            Borrow
          </button>

          <button
            type="button"
            role="tab"
            className={`tab tab-sm ${activeTab === 'repay' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('repay')}
          >
            Repay
          </button>

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
          isLoading={isLoading}
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
      {activeTab === 'deposit' && (
        <div className="flex justify-center">
          {lenderData && <LendingActionTab lenderData={lenderData} chainId={effectiveChainId} actionType="Deposit" />}
        </div>
      )}
      {activeTab === 'withdraw' && (
        <div className="flex justify-center">
          {lenderData && <LendingActionTab lenderData={lenderData} chainId={effectiveChainId} actionType="Withdraw" />}
        </div>
      )}
      {activeTab === 'borrow' && (
        <div className="flex justify-center">
          {lenderData && <LendingActionTab lenderData={lenderData} chainId={effectiveChainId} actionType="Borrow" />}
        </div>
      )}
      {activeTab === 'repay' && (
        <div className="flex justify-center">
          {lenderData && <LendingActionTab lenderData={lenderData} chainId={effectiveChainId} actionType="Repay" />}
        </div>
      )}
      {activeTab === 'trading' && (
        <TradingDashboard
          lenderData={lenderData}
          userData={userData}
          chainId={effectiveChainId}
          account={account}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}

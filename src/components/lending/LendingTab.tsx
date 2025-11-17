// src/components/LenderTab.tsx
import React, { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { UserLenderPositionsTable } from './UserTable'
import { LendingPoolsTable } from './PoolsTable'
import { ChainFilterSelect } from './ChainFilter'
import { useFlattenedPools } from '../../hooks/lending/useEarnData.js'

export function LenderTab() {
  const { address: account } = useAccount()
  const { pools } = useFlattenedPools()

  // shared chain filter state
  const [selectedChain, setSelectedChain] = useState<string>('1')

  // derive available chains from pools (unique + sorted)
  const chains = useMemo(
    () => Array.from(new Set(pools.map((p) => p.chainId))),
    [pools],
  )

  // pass undefined to children when "all" is selected
  const effectiveChainId = selectedChain

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ChainFilterSelect
          chains={chains}
          value={selectedChain}
          onChange={setSelectedChain}
        />
      </div>

      {account && (
        <UserLenderPositionsTable
          account={account}
          chainId={effectiveChainId}
        />
      )}

      <LendingPoolsTable chainId={effectiveChainId} />
    </div>
  )
}

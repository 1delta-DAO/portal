import React from 'react'
import { lenderDisplayName } from '@1delta/lib-utils'
import type { PoolEntry } from '../../../hooks/lending/useFlattenedPools'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { TokenBalance } from '../../../hooks/lending/useTokenBalances'
import { DepositAction } from '../DashboardActions'
import { WalletConnect } from '../../connect'

interface DepositPanelProps {
  selectedEntry: PoolEntry | null
  resolvedPool: PoolDataItem | null
  walletBalance: TokenBalance | null
  account?: string
}

export const DepositPanel: React.FC<DepositPanelProps> = ({
  selectedEntry,
  resolvedPool,
  walletBalance,
  account,
}) => {
  return (
    <div className="w-72 shrink-0 rounded-box border border-base-300 p-3 space-y-3 sticky top-4">
      <h3 className="text-sm font-semibold">Deposit</h3>

      {/* Selected asset display */}
      {resolvedPool ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200">
          <img
            src={resolvedPool.asset.logoURI}
            width={32}
            height={32}
            alt={resolvedPool.asset.symbol}
            className="rounded-full object-cover w-8 h-8 shrink-0"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-sm">{resolvedPool.asset.symbol}</span>
            <span className="text-xs text-base-content/60 truncate">
              {lenderDisplayName(selectedEntry!.lenderKey)}
            </span>
          </div>
        </div>
      ) : selectedEntry ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200">
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-sm">{selectedEntry.assetGroup}</span>
            <span className="text-xs text-base-content/60 truncate">
              {lenderDisplayName(selectedEntry.lenderKey)}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-base-content/60 text-center p-3 rounded-lg border border-dashed border-base-300">
          Click a row to select a pool
        </div>
      )}

      {/* Deposit action */}
      {!account ? (
        <div className="w-full flex justify-center">
          <WalletConnect />
        </div>
      ) : (
        <DepositAction
          pool={resolvedPool}
          userPosition={null}
          walletBalance={walletBalance}
          account={account}
        />
      )}
    </div>
  )
}

import React, { useState } from 'react'
import type { RawCurrency } from '@1delta/lib-utils'
import type { PoolEntry } from '../../../hooks/lending/useFlattenedPools'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry, UserSubAccount } from '../../../hooks/lending/useUserData'
import type { TokenBalance } from '../../../hooks/lending/useTokenBalances'
import { useSyncChain } from '../../../hooks/useSyncChain'
import { DepositAction, WithdrawAction } from '../DashboardActions'
import { WalletConnect } from '../../connect'

type EarnAction = 'Deposit' | 'Withdraw'

interface DepositPanelProps {
  selectedEntry: PoolEntry | null
  resolvedPool: PoolDataItem | null
  walletBalance: TokenBalance | null
  account?: string
  chainId?: string
  nativeToken?: RawCurrency | null
  nativeBalance?: TokenBalance | null
  subAccounts?: UserSubAccount[]
  lenderKey?: string
  userPosition?: UserPositionEntry | null
}

export const DepositPanel: React.FC<DepositPanelProps> = ({
  selectedEntry,
  resolvedPool,
  walletBalance,
  account,
  chainId,
  nativeToken,
  nativeBalance,
  subAccounts,
  lenderKey,
  userPosition,
}) => {
  const [actionTab, setActionTab] = useState<EarnAction>('Deposit')
  const { syncChain, currentChainId } = useSyncChain()
  const isWrongChain = !!account && !!chainId && currentChainId !== Number(chainId)

  return (
    <div className="w-72 shrink-0 rounded-box border border-base-300 p-3 space-y-3 sticky top-4">
      {/* Deposit / Withdraw tabs */}
      <div role="tablist" className="tabs tabs-boxed tabs-xs">
        {(['Deposit', 'Withdraw'] as EarnAction[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            className={`tab ${actionTab === t ? 'tab-active' : ''}`}
            onClick={() => setActionTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Selected asset display */}
      {resolvedPool ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200">
          <img
            src={resolvedPool.asset.logoURI}
            width={32}
            height={32}
            alt={resolvedPool.asset.symbol}
            className="rounded-full object-contain w-8 h-8 shrink-0"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-sm truncate" title={selectedEntry!.name}>
              {selectedEntry!.name}
            </span>
            <span className="text-xs text-base-content/60 truncate" title={resolvedPool.asset.symbol}>
              {resolvedPool.asset.symbol}
            </span>
          </div>
        </div>
      ) : selectedEntry ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200">
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-sm truncate" title={selectedEntry.name}>
              {selectedEntry.name}
            </span>
            <span className="text-xs text-base-content/60 truncate" title={selectedEntry.assetGroup}>
              {selectedEntry.assetGroup}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-base-content/60 text-center p-3 rounded-lg border border-dashed border-base-300">
          Click a row to select a pool
        </div>
      )}

      {/* Action component */}
      {!account ? (
        <div className="w-full flex justify-center">
          <WalletConnect />
        </div>
      ) : isWrongChain ? (
        <button
          type="button"
          className="btn btn-warning btn-sm w-full"
          onClick={() => syncChain(Number(chainId))}
        >
          Switch Wallet Chain
        </button>
      ) : actionTab === 'Deposit' ? (
        <DepositAction
          pool={resolvedPool}
          userPosition={userPosition ?? null}
          walletBalance={walletBalance}
          account={account}
          chainId={chainId ?? ''}
          nativeToken={nativeToken}
          nativeBalance={nativeBalance}
          subAccounts={subAccounts}
          lenderKey={lenderKey}
        />
      ) : (
        <WithdrawAction
          pool={resolvedPool}
          userPosition={userPosition ?? null}
          walletBalance={walletBalance}
          account={account}
          chainId={chainId ?? ''}
          nativeToken={nativeToken}
          nativeBalance={nativeBalance}
          subAccounts={subAccounts}
          lenderKey={lenderKey}
        />
      )}
    </div>
  )
}

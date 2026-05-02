import React, { useState } from 'react'
import type { RawCurrency } from '../../../../types/currency'
import type { PoolEntry } from '../../../../hooks/lending/useFlattenedPools'
import type { PoolDataItem } from '../../../../hooks/lending/usePoolData'
import type { UserPositionEntry, UserSubAccount } from '../../../../hooks/lending/useUserData'
import type { TokenBalance } from '../../../../hooks/lending/useTokenBalances'
import { useSyncChain } from '../../../../hooks/useSyncChain'
import { DepositAction, WithdrawAction } from '../../actions'
import { WalletConnect } from '../../../connect'

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
  isBalancesFetching?: boolean
  refetchBalances?: () => void
  /**
   * Whether the user has any open borrow on the *selected pool's lender*.
   * Scoped to the lender (not the chain) because cross-lender debt doesn't
   * share collateral with this deposit, so flagging it would be noise.
   */
  hasBorrowOnSelectedLender?: boolean
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
  isBalancesFetching,
  refetchBalances,
  hasBorrowOnSelectedLender,
}) => {
  const [actionTab, setActionTab] = useState<EarnAction>('Deposit')
  const { syncChain, currentChainId } = useSyncChain()
  const isWrongChain = !!account && !!chainId && currentChainId !== Number(chainId)

  return (
    <div className="w-72 shrink-0 rounded-box border border-base-300 p-3 space-y-3 sticky top-4">
      {/* Lender header — earn spans many lenders, so unlike the lending tab
          (which is scoped to one lender) we need to surface which protocol
          the selected market belongs to. */}
      {selectedEntry?.lenderInfo && (
        <div className="flex items-center gap-2 px-1">
          {selectedEntry.lenderInfo.logoURI && (
            <img
              src={selectedEntry.lenderInfo.logoURI}
              width={20}
              height={20}
              alt={selectedEntry.lenderInfo.name}
              className="rounded-full object-contain w-5 h-5 shrink-0"
            />
          )}
          <span className="font-semibold text-sm truncate" title={selectedEntry.lenderInfo.name}>
            {selectedEntry.lenderInfo.name}
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-base-content/40">
            Lender
          </span>
        </div>
      )}

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
            className="rounded-full object-contain w-8 h-8 shrink-0 token-logo"
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
            <span className="text-xs text-base-content/60 truncate" title={selectedEntry.underlyingInfo?.asset?.symbol}>
              {selectedEntry.underlyingInfo?.asset?.symbol ?? selectedEntry.name}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-base-content/60 text-center p-3 rounded-lg border border-dashed border-base-300">
          Click a row to select a pool
        </div>
      )}

      {/* Borrow-position warning — earn hides health/simulation, so flag this
          explicitly so users with open debt on this lender know their action
          affects health. */}
      {hasBorrowOnSelectedLender && account && (
        <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-warning/10 border border-warning/30 text-[11px] text-base-content">
          <svg
            className="w-3.5 h-3.5 mt-px shrink-0 text-warning"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <span>
            You have an open borrow on this lender. Use the <strong>Lending</strong> tab to see health-factor impact.
          </span>
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
          isBalancesFetching={isBalancesFetching}
          refetchBalances={refetchBalances}
          hideSimulation
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
          isBalancesFetching={isBalancesFetching}
          refetchBalances={refetchBalances}
          hideSimulation
        />
      )}
    </div>
  )
}

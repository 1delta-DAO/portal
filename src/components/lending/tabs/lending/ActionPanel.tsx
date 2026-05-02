import React from 'react'
import type { PoolDataItem } from '../../../../hooks/lending/usePoolData'
import type { UserPositionEntry, UserSubAccount } from '../../../../hooks/lending/useUserData'
import {
  DepositAction,
  WithdrawAction,
  BorrowAction,
  RepayAction,
  type ActionType,
} from '../../actions'
import { WalletConnect } from '../../../connect'
import type { TokenBalance } from '../../../../hooks/lending/useTokenBalances'
import type { RawCurrency } from '../../../../types/currency'

interface ActionContentProps {
  actionTab: ActionType
  selectedPool: PoolDataItem | null
  selectedPoolUserPos: UserPositionEntry | null
  selectedPoolWalletBal: TokenBalance | null
  account: string
  chainId: string
  selectedSubAccountId: string | null
  subAccounts: UserSubAccount[]
  selectedLender: string
  nativeToken: RawCurrency | null
  nativeBalance: TokenBalance | null
  activeSubAccount: UserSubAccount | null
  isBalancesFetching?: boolean
  refetchBalances?: () => void
}

/** Renders the action form (Deposit/Withdraw/Borrow/Repay) for a connected wallet */
const ActionContent: React.FC<ActionContentProps> = ({
  actionTab,
  selectedPool,
  selectedPoolUserPos,
  selectedPoolWalletBal,
  account,
  chainId,
  selectedSubAccountId,
  subAccounts,
  selectedLender,
  nativeToken,
  nativeBalance,
  activeSubAccount,
  isBalancesFetching,
  refetchBalances,
}) => {
  const common = {
    pool: selectedPool,
    userPosition: selectedPoolUserPos,
    walletBalance: selectedPoolWalletBal,
    account,
    chainId,
    accountId: selectedSubAccountId ?? undefined,
    subAccounts,
    lenderKey: selectedLender,
    nativeToken,
    nativeBalance,
    subAccount: activeSubAccount ?? undefined,
    isBalancesFetching,
    refetchBalances,
  }

  return (
    <>
      {actionTab === 'Deposit' && <DepositAction {...common} />}
      {actionTab === 'Withdraw' && <WithdrawAction {...common} />}
      {actionTab === 'Borrow' && <BorrowAction {...common} />}
      {actionTab === 'Repay' && <RepayAction {...common} />}
    </>
  )
}

/* ── Action tabs bar ── */

export const ActionTabs: React.FC<{
  actionTab: ActionType
  onTabChange: (tab: ActionType) => void
}> = ({ actionTab, onTabChange }) => (
  <div role="tablist" className="tabs tabs-boxed tabs-xs">
    {(['Deposit', 'Withdraw', 'Borrow', 'Repay'] as ActionType[]).map((t) => (
      <button
        key={t}
        type="button"
        role="tab"
        className={`tab ${actionTab === t ? 'tab-active' : ''}`}
        onClick={() => onTabChange(t)}
      >
        {t}
      </button>
    ))}
  </div>
)

/* ── Selected asset badge ── */

const SelectedAssetBadge: React.FC<{
  pool: PoolDataItem | null
  lenderInfo?: { name: string; logoURI: string }
}> = ({ pool, lenderInfo }) =>
  pool ? (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200">
      <img
        src={pool.asset.logoURI}
        width={32}
        height={32}
        alt={pool.asset.symbol}
        className="rounded-full object-contain w-8 h-8 shrink-0 token-logo"
      />
      <div className="flex flex-col min-w-0">
        <span className="font-medium text-sm truncate" title={pool.name}>
          {pool.asset.symbol}
        </span>
        {lenderInfo ? (
          <span className="text-xs text-base-content/60 truncate flex items-center gap-1">
            <img src={lenderInfo.logoURI} width={14} height={14} alt={lenderInfo.name} className="rounded-full object-contain w-3.5 h-3.5" />
            {lenderInfo.name}
          </span>
        ) : (
          <span className="text-xs text-base-content/60 truncate" title={pool.asset.symbol}>
            {pool.asset.symbol}
          </span>
        )}
      </div>
    </div>
  ) : (
    <div className="text-sm text-base-content/60 text-center p-3 rounded-lg border border-dashed border-base-300">
      Select an asset from the market table
    </div>
  )

/* ── Wallet gate: connect / switch chain / show action ── */

interface WalletGateProps extends ActionContentProps {
  isWrongChain: boolean
  syncChain: (chainId: number) => void
}

const WalletGate: React.FC<Omit<WalletGateProps, 'account'> & { account?: string }> = ({
  account,
  isWrongChain,
  syncChain,
  chainId,
  ...rest
}) => {
  if (!account) {
    return (
      <div className="w-full flex justify-center">
        <WalletConnect />
      </div>
    )
  }
  if (isWrongChain) {
    return (
      <button
        type="button"
        className="btn btn-warning btn-sm w-full"
        onClick={() => syncChain(Number(chainId))}
      >
        Switch Wallet Chain
      </button>
    )
  }
  return <ActionContent account={account} chainId={chainId} {...rest} />
}

/* ── Desktop sidebar panel ── */

export interface ActionPanelProps {
  actionTab: ActionType
  onTabChange: (tab: ActionType) => void
  selectedPool: PoolDataItem | null
  selectedPoolUserPos: UserPositionEntry | null
  selectedPoolWalletBal: TokenBalance | null
  account?: string
  chainId: string
  isWrongChain: boolean
  syncChain: (chainId: number) => void
  selectedSubAccountId: string | null
  subAccounts: UserSubAccount[]
  selectedLender: string
  nativeToken: RawCurrency | null
  nativeBalance: TokenBalance | null
  activeSubAccount: UserSubAccount | null
  lenderInfo?: { name: string; logoURI: string }
  isBalancesFetching?: boolean
  refetchBalances?: () => void
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  actionTab,
  onTabChange,
  selectedPool,
  lenderInfo,
  ...rest
}) => (
  <div className="hidden md:block w-72 shrink-0 rounded-box border border-base-300 p-3 space-y-3 sticky top-4">
    <ActionTabs actionTab={actionTab} onTabChange={onTabChange} />
    <SelectedAssetBadge pool={selectedPool} lenderInfo={lenderInfo} />
    <WalletGate actionTab={actionTab} selectedPool={selectedPool} {...rest} />
  </div>
)

/* ── Mobile action modal ── */

export const MobileActionModal: React.FC<
  ActionPanelProps & { onClose: () => void }
> = ({ onClose, actionTab, onTabChange, selectedPool, lenderInfo, ...rest }) => {
  if (!selectedPool) return null

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          ✕
        </button>
        <div className="space-y-3">
          <ActionTabs actionTab={actionTab} onTabChange={onTabChange} />
          <SelectedAssetBadge pool={selectedPool} lenderInfo={lenderInfo} />
          <WalletGate actionTab={actionTab} selectedPool={selectedPool} {...rest} />
        </div>
      </div>
    </div>
  )
}

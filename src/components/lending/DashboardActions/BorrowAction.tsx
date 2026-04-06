import React, { useEffect, useState } from 'react'
import { isWNative } from '../../../lib/lib-utils'
import { zeroAddress } from 'viem'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { formatTokenAmount, formatUsd, parseAmount } from './format'
import { AmountInput } from '../../common/AmountInput'
import { NativeCurrencySelector } from './NativeCurrencySelector'
import { SubAccountSelector } from './SubAccountSelector'
import { lenderSupportsSubAccounts } from './helpers'
import { HealthFactorProjection } from './HealthFactorProjection'
import { RateImpactIndicator } from './RateImpactIndicator'
import { TransactionSuccess } from './TransactionSuccess'

export const BorrowAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  walletBalance,
  account,
  chainId,
  accountId,
  subAccounts,
  lenderKey,
  nativeToken,
  subAccount,
  isBalancesFetching,
  refetchBalances,
}) => {
  const [amount, setAmount] = useState('')
  const [useNative, setUseNative] = useState(false)

  const hasSubAccounts = lenderSupportsSubAccounts(lenderKey)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId ?? null)

  useEffect(() => {
    setSelectedAccountId(accountId ?? null)
  }, [accountId])

  const canUseNative = !!pool && isWNative(pool.asset) && !!nativeToken

  const { result, simulation, rateImpact, loading, executingPermission, executingMain, permissions, hasPermissions, permissionsCompleted, allPermissionsDone, error, txSuccess, executeNextPermission, executeMain, resetState, dismissSuccess } =
    useActionExecution({
      actionType: 'Borrow',
      pool,
      account,
      amount,
      isAll: false,
      receiveAsset: canUseNative && useNative ? zeroAddress : undefined,
      accountId: hasSubAccounts ? selectedAccountId ?? undefined : undefined,
      chainId,
      subAccount,
    })

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setUseNative(false)
    resetState()
  }, [pool?.marketUid])

  const depositsStr = String(userPosition?.deposits ?? '0')
  const debtStr = String(userPosition?.debt ?? '0')
  const debtStableStr = String(userPosition?.debtStable ?? '0')
  const borrowableStr = String(userPosition?.borrowable ?? '0')
  const debtTotal = parseAmount(debtStr) + parseAmount(debtStableStr)
  const overMax = parseAmount(borrowableStr) > 0 && parseAmount(amount) > parseAmount(borrowableStr) + 1e-9

  if (txSuccess) {
    return (
      <TransactionSuccess
        actionType={txSuccess.actionType}
        amount={txSuccess.amount}
        symbol={txSuccess.symbol}
        hash={txSuccess.hash}
        onDismiss={() => { dismissSuccess(); setAmount('') }}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Sub-account selector */}
      {hasSubAccounts && (
        <SubAccountSelector
          subAccounts={subAccounts ?? []}
          selectedAccountId={selectedAccountId}
          onChange={setSelectedAccountId}
          allowCreate={false}
        />
      )}

      {/* Native/wrapped selector */}
      {canUseNative && nativeToken && (
        <NativeCurrencySelector
          wrappedSymbol={pool!.asset.symbol}
          nativeToken={nativeToken}
          useNative={useNative}
          onChange={setUseNative}
          label="Receive as"
        />
      )}

      {/* Wallet balance */}
      {walletBalance && parseFloat(walletBalance.balance) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60 flex items-center gap-1">
            Wallet balance:
            {refetchBalances && (
              <button type="button" className="text-base-content/30 hover:text-base-content/60 transition-colors" onClick={refetchBalances} title="Refresh balance">
                {isBalancesFetching ? <span className="loading loading-spinner w-2.5 h-2.5" /> : (
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
                )}
              </button>
            )}
          </span>
          <span className="font-medium">
            {formatTokenAmount(walletBalance.balance)} (${formatUsd(walletBalance.balanceUSD)})
          </span>
        </div>
      )}

      {/* User position context */}
      {userPosition && parseAmount(depositsStr) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Your deposits:</span>
          <span className="text-success font-medium">
            {formatTokenAmount(userPosition.deposits)} (${formatUsd(userPosition.depositsUSD)})
          </span>
        </div>
      )}
      {userPosition && debtTotal > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Current debt:</span>
          <span className="text-error font-medium">
            {formatTokenAmount(debtTotal)} (${formatUsd(userPosition.debtUSD + userPosition.debtStableUSD)})
          </span>
        </div>
      )}
      {parseAmount(borrowableStr) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Available to borrow:</span>
          <span className="text-warning font-medium">
            {formatTokenAmount(borrowableStr)}
          </span>
        </div>
      )}

      {/* Pool info */}
      {pool && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Borrow APR:</span>
          <span className="text-warning font-medium">{pool.variableBorrowRate.toFixed(2)}%</span>
        </div>
      )}

      {/* Amount input */}
      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={borrowableStr}
        disabled={!pool}
        error={overMax ? `Exceeds borrowable amount (${formatTokenAmount(borrowableStr)}).` : null}
      />

      {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          <span>Simulating...</span>
        </div>
      )}

      {/* Projected health factor */}
      <HealthFactorProjection simulation={simulation} />

      {/* Rate impact */}
      <RateImpactIndicator rateImpact={rateImpact} />

      {result && !overMax && hasPermissions && !allPermissionsDone && (
        <div className="space-y-1">
          <span className="text-xs text-base-content/60">Approvals ({permissionsCompleted}/{permissions.length})</span>
          {permissions.map((perm, i) => {
            const done = i < permissionsCompleted
            const isCurrent = i === permissionsCompleted
            return (
              <button
                key={i}
                type="button"
                className={`btn btn-sm w-full ${done ? 'btn-disabled btn-outline btn-success' : isCurrent ? 'btn-warning' : 'btn-outline btn-ghost'}`}
                disabled={!isCurrent || executingPermission}
                onClick={isCurrent ? executeNextPermission : undefined}
                title={perm.description || `Approval ${i + 1}`}
              >
                <span className="truncate max-w-full">
                  {done ? `\u2713 ${perm.description || `Approval ${i + 1}`}` : isCurrent && executingPermission ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    perm.description || `Approval ${i + 1}`
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {result && !overMax && (!hasPermissions || allPermissionsDone) && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executingMain}
          onClick={executeMain}
        >
          {executingMain ? <span className="loading loading-spinner loading-xs" /> : 'Execute Borrow'}
        </button>
      )}
    </div>
  )
}

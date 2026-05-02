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

export const DepositAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  walletBalance,
  account,
  chainId,
  accountId,
  subAccounts,
  lenderKey,
  nativeToken,
  nativeBalance,
  subAccount,
  isBalancesFetching,
  refetchBalances,
  hideSimulation,
}) => {
  const [amount, setAmount] = useState('')
  const [useNative, setUseNative] = useState(false)

  const hasSubAccounts = lenderSupportsSubAccounts(lenderKey)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId ?? null)

  // Sync with parent's accountId when it changes
  useEffect(() => {
    setSelectedAccountId(accountId ?? null)
  }, [accountId])

  const canUseNative = !!pool && isWNative(pool.asset) && !!nativeToken

  const { result, simulation, rateImpact, loading, executingPermission, executingMain, permissions, hasPermissions, permissionsCompleted, allPermissionsDone, error, txSuccess, executeNextPermission, executeMain, resetState, dismissSuccess } =
    useActionExecution({
      actionType: 'Deposit',
      pool,
      account,
      amount,
      isAll: false,
      payAsset: canUseNative && useNative ? zeroAddress : undefined,
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

  // For wnative markets where the user holds the native token but no wrapped
  // balance (typical: CELO/ETH/MATIC sitting in the wallet, no WCELO/WETH/etc.),
  // default the toggle to "Pay with native" so the wallet balance display and
  // the % quick-buttons immediately have something to scale from.
  useEffect(() => {
    if (!canUseNative || useNative) return
    const wrappedBal = parseAmount(walletBalance?.balance ?? '0')
    const nativeBal = parseAmount(nativeBalance?.balance ?? '0')
    if (wrappedBal === 0 && nativeBal > 0) setUseNative(true)
  }, [canUseNative, useNative, walletBalance, nativeBalance])

  const activeBal = canUseNative && useNative ? nativeBalance : walletBalance
  const walletAmountStr = activeBal?.balance ?? '0'
  const overMax = parseAmount(walletAmountStr) > 0 && parseAmount(amount) > parseAmount(walletAmountStr) + 1e-9

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
          allowCreate
          chainId={chainId}
          lender={lenderKey}
          account={account}
        />
      )}

      {/* Native/wrapped selector */}
      {canUseNative && nativeToken && (
        <NativeCurrencySelector
          wrappedSymbol={pool!.asset.symbol}
          nativeToken={nativeToken}
          useNative={useNative}
          onChange={setUseNative}
          label="Pay with"
        />
      )}

      {/* Wallet balance — always render the row when a pool is selected so the
          user gets immediate "loading…" feedback instead of an empty space. */}
      {pool && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60 flex items-center gap-1">
            Wallet balance:
            {refetchBalances && (
              <button
                type="button"
                className="text-base-content/30 hover:text-base-content/60 transition-colors"
                onClick={refetchBalances}
                title="Refresh balance"
              >
                {isBalancesFetching ? (
                  <span className="loading loading-spinner w-2.5 h-2.5" />
                ) : (
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  </svg>
                )}
              </button>
            )}
          </span>
          {activeBal ? (
            <span className={`font-medium ${parseAmount(walletAmountStr) === 0 ? 'text-base-content/40' : ''}`}>
              {formatTokenAmount(activeBal.balance)} (${formatUsd(activeBal.balanceUSD)})
            </span>
          ) : isBalancesFetching ? (
            <span className="flex items-center gap-1 text-base-content/40">
              <span className="loading loading-spinner w-3 h-3" />
              Loading…
            </span>
          ) : (
            <span className="text-base-content/40">—</span>
          )}
        </div>
      )}

      {/* Current deposits */}
      {userPosition && Number(userPosition.deposits) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Current deposits:</span>
          <span className="text-success font-medium">
            {formatTokenAmount(userPosition.deposits)} (${formatUsd(userPosition.depositsUSD)})
          </span>
        </div>
      )}

      {/* Amount input */}
      <AmountInput
        value={amount}
        onChange={setAmount}
        maxAmount={walletAmountStr}
        decimals={pool?.asset?.decimals}
        disabled={!pool}
        error={overMax ? `Exceeds wallet balance (${formatTokenAmount(walletAmountStr)}).` : null}
      />

      {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          <span>Simulating...</span>
        </div>
      )}

      {!hideSimulation && (
        <>
          {/* Projected health factor */}
          <HealthFactorProjection simulation={simulation} />

          {/* Rate impact */}
          <RateImpactIndicator rateImpact={rateImpact} />
        </>
      )}

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
          {executingMain ? <span className="loading loading-spinner loading-xs" /> : 'Execute Deposit'}
        </button>
      )}
    </div>
  )
}

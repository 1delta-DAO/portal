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

export const WithdrawAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  account,
  chainId,
  accountId,
  subAccounts,
  lenderKey,
  nativeToken,
  subAccount,
}) => {
  const [amount, setAmount] = useState('')
  const [isAll, setIsAll] = useState(false)
  const [useNative, setUseNative] = useState(false)

  const hasSubAccounts = lenderSupportsSubAccounts(lenderKey)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId ?? null)

  useEffect(() => {
    setSelectedAccountId(accountId ?? null)
  }, [accountId])

  const canUseNative = !!pool && isWNative(pool.asset) && !!nativeToken

  const {
    result,
    simulation,
    rateImpact,
    loading,
    executingPermission,
    executingMain,
    permissions,
    hasPermissions,
    permissionsCompleted,
    allPermissionsDone,
    error,
    txSuccess,
    executeNextPermission,
    executeMain,
    resetState,
    dismissSuccess,
  } = useActionExecution({
    actionType: 'Withdraw',
    pool,
    account,
    amount,
    isAll,
    receiveAsset: canUseNative && useNative ? zeroAddress : undefined,
    accountId: hasSubAccounts ? (selectedAccountId ?? undefined) : undefined,
    chainId,
    subAccount,
  })

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setIsAll(false)
    setUseNative(false)
    resetState()
  }, [pool?.marketUid])

  const withdrawableStr = String(userPosition?.withdrawable ?? '0')
  const depositsStr = String(userPosition?.deposits ?? '0')
  const overMax = !isAll && parseAmount(withdrawableStr) > 0 && parseAmount(amount) > parseAmount(withdrawableStr) + 1e-9

  // Any user input (typing or 25/50/75 presets) clears the isAll flag.
  const handleAmountChange = (val: string) => {
    setIsAll(false)
    setAmount(val)
  }

  // The "Max" preset is special: it sets isAll=true (so the backend repays
  // the full position via the dedicated isAll flag, not a fixed amount).
  const handleMaxClick = () => {
    setIsAll(true)
    if (parseAmount(withdrawableStr) > 0) setAmount(withdrawableStr)
  }

  if (txSuccess) {
    return (
      <TransactionSuccess
        actionType={txSuccess.actionType}
        amount={txSuccess.amount}
        symbol={txSuccess.symbol}
        hash={txSuccess.hash}
        onDismiss={() => {
          dismissSuccess()
          setAmount('')
          setIsAll(false)
        }}
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

      {/* Available balance */}
      {userPosition && parseAmount(depositsStr) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Available to withdraw:</span>
          <span className="text-success font-medium">
            {formatTokenAmount(userPosition.withdrawable)} (${formatUsd(userPosition.depositsUSD)})
          </span>
        </div>
      )}

      {/* Amount input with quick buttons */}
      <AmountInput
        value={amount}
        onChange={handleAmountChange}
        maxAmount={withdrawableStr}
        decimals={pool?.asset?.decimals}
        onMaxClick={handleMaxClick}
        disabled={!pool}
        error={overMax ? `Exceeds withdrawable balance (${formatTokenAmount(withdrawableStr)}).` : null}
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
          <span className="text-xs text-base-content/60">
            Approvals ({permissionsCompleted}/{permissions.length})
          </span>
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
                  {done ? (
                    `\u2713 ${perm.description || `Approval ${i + 1}`}`
                  ) : isCurrent && executingPermission ? (
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
          {executingMain ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            'Execute Withdraw'
          )}
        </button>
      )}
    </div>
  )
}

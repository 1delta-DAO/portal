import React, { useEffect, useState } from 'react'
import { isWNative } from '@1delta/lib-utils'
import { zeroAddress } from 'viem'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { formatTokenAmount, formatUsd, parseAmount, formatTokenForInput } from './format'
import { AmountQuickButtons } from './AmountQuickButtons'
import { NativeCurrencySelector } from './NativeCurrencySelector'
import { SubAccountSelector } from './SubAccountSelector'
import { lenderSupportsSubAccounts } from './helpers'
import { HealthFactorProjection } from './HealthFactorProjection'
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

  const withdrawableToken = userPosition ? parseAmount(userPosition.withdrawable) : 0
  const depositsToken = userPosition ? parseAmount(userPosition.deposits) : 0
  const currentAmount = parseAmount(amount)
  const overMax = withdrawableToken > 0 && currentAmount > withdrawableToken + 1e-9

  const handleQuickSelect = (val: string) => {
    setIsAll(false)
    setAmount(val)
  }

  const handleIsAllChange = (checked: boolean) => {
    setIsAll(checked)
    if (checked && withdrawableToken > 0) {
      setAmount(formatTokenForInput(withdrawableToken))
    }
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
      {userPosition && depositsToken > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Available to withdraw:</span>
          <span className="text-success font-medium">
            {formatTokenAmount(userPosition.withdrawable)} (${formatUsd(userPosition.depositsUSD)})
          </span>
        </div>
      )}

      {/* Amount input with quick buttons */}
      <div className="form-control">
        <div className="flex justify-between items-center mb-1">
          <span className="label-text text-xs">Amount</span>
          <AmountQuickButtons
            maxAmount={withdrawableToken}
            onSelect={handleQuickSelect}
            onMax={() => handleIsAllChange(true)}
          />
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="input input-bordered input-sm w-full"
          placeholder="0.0"
          value={amount}
          onChange={(e) => {
            setIsAll(false)
            setAmount(e.target.value)
          }}
          disabled={!pool}
        />
      </div>

      {overMax && !isAll && (
        <div className="text-[10px] text-error">
          Exceeds withdrawable balance ({formatTokenAmount(withdrawableToken)}).
        </div>
      )}

      {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-1 text-xs text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          <span>Simulating...</span>
        </div>
      )}

      {/* Projected health factor */}
      <HealthFactorProjection simulation={simulation} />

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
              >
                {done ? (
                  `\u2713 ${perm.description || `Approval ${i + 1}`}`
                ) : isCurrent && executingPermission ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  perm.description || `Approval ${i + 1}`
                )}
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

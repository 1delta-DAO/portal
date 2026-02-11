import React, { useEffect, useState } from 'react'
import { isWNative } from '@1delta/lib-utils'
import { zeroAddress } from 'viem'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { formatTokenAmount, formatUsd } from './format'
import { AmountQuickButtons } from './AmountQuickButtons'
import { NativeCurrencySelector } from './NativeCurrencySelector'
import { SubAccountSelector } from './SubAccountSelector'
import { lenderSupportsSubAccounts } from './helpers'

export const DepositAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  walletBalance,
  account,
  accountId,
  subAccounts,
  lenderKey,
  nativeToken,
  nativeBalance,
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

  const { result, loading, executingPermission, executingMain, permissions, hasPermissions, permissionsCompleted, allPermissionsDone, error, fetchAction, executeNextPermission, executeMain, resetState } =
    useActionExecution({
      actionType: 'Deposit',
      pool,
      account,
      amount,
      isAll: false,
      payAsset: canUseNative && useNative ? zeroAddress : undefined,
      accountId: hasSubAccounts ? selectedAccountId ?? undefined : undefined,
    })

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setUseNative(false)
    resetState()
  }, [pool?.marketUid])

  const activeBal = canUseNative && useNative ? nativeBalance : walletBalance
  const walletAmount = activeBal ? parseFloat(activeBal.balance) : 0

  return (
    <div className="space-y-3">
      {/* Sub-account selector */}
      {hasSubAccounts && (
        <SubAccountSelector
          subAccounts={subAccounts ?? []}
          selectedAccountId={selectedAccountId}
          onChange={setSelectedAccountId}
          allowCreate
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

      {/* Wallet balance */}
      {activeBal && walletAmount > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Wallet balance:</span>
          <span className="font-medium">
            {formatTokenAmount(activeBal.balance)} (${formatUsd(activeBal.balanceUSD)})
          </span>
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
      <div className="form-control">
        <div className="flex justify-between items-center mb-1">
          <span className="label-text text-xs">Amount</span>
          <AmountQuickButtons maxAmount={walletAmount} onSelect={(val) => setAmount(val)} />
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="input input-bordered input-sm w-full"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!pool}
        />
      </div>

      {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={loading || !pool || !account}
        onClick={fetchAction}
      >
        {loading ? <span className="loading loading-spinner loading-xs" /> : 'Prepare Deposit'}
      </button>

      {result && hasPermissions && !allPermissionsDone && (
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
              >
                {done ? `\u2713 ${perm.info || `Approval ${i + 1}`}` : isCurrent && executingPermission ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  perm.info || `Approval ${i + 1}`
                )}
              </button>
            )
          })}
        </div>
      )}

      {result && (!hasPermissions || allPermissionsDone) && (
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

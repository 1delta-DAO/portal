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

export const WithdrawAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  walletBalance,
  account,
  accountId,
  subAccounts,
  lenderKey,
  nativeToken,
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
  const needsAccount = hasSubAccounts && !selectedAccountId

  const { result, loading, executing, executingPermission, executingMain, hasPermission, permissionDone, error, fetchAction, executePermission, executeMain, resetState } =
    useActionExecution({
      actionType: 'Withdraw',
      pool,
      account,
      amount,
      isAll,
      receiveAsset: canUseNative && useNative ? zeroAddress : undefined,
      accountId: hasSubAccounts ? selectedAccountId ?? undefined : undefined,
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
    if (checked && depositsToken > 0) {
      setAmount(formatTokenForInput(depositsToken))
    }
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
          <AmountQuickButtons maxAmount={withdrawableToken} onSelect={handleQuickSelect} />
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="input input-bordered input-sm w-full"
          placeholder="0.0"
          value={amount}
          onChange={(e) => { setIsAll(false); setAmount(e.target.value) }}
          disabled={!pool}
        />
      </div>

      {/* Withdraw full balance toggle */}
      <label className="label cursor-pointer justify-start gap-2 py-0">
        <input
          type="checkbox"
          className="checkbox checkbox-primary checkbox-xs"
          checked={isAll}
          onChange={(e) => handleIsAllChange(e.target.checked)}
        />
        <span className="label-text text-xs">Withdraw full balance</span>
      </label>

      {overMax && !isAll && (
        <div className="text-[10px] text-error">
          Exceeds withdrawable balance ({formatTokenAmount(withdrawableToken)}).
        </div>
      )}

      {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={loading || !pool || !account || needsAccount}
        onClick={fetchAction}
      >
        {loading ? <span className="loading loading-spinner loading-xs" /> : 'Prepare Withdraw'}
      </button>

      {result && hasPermission && !permissionDone && (
        <button
          type="button"
          className="btn btn-warning btn-sm w-full"
          disabled={executingPermission}
          onClick={executePermission}
        >
          {executingPermission ? <span className="loading loading-spinner loading-xs" /> : 'Approve Permission'}
        </button>
      )}

      {result && (!hasPermission || permissionDone) && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executingMain}
          onClick={executeMain}
        >
          {executingMain ? <span className="loading loading-spinner loading-xs" /> : 'Execute Withdraw'}
        </button>
      )}
    </div>
  )
}

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

export const RepayAction: React.FC<ActionPanelProps> = ({
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
  const [isAll, setIsAll] = useState(false)
  const [useNative, setUseNative] = useState(false)

  const hasSubAccounts = lenderSupportsSubAccounts(lenderKey)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId ?? null)

  useEffect(() => {
    setSelectedAccountId(accountId ?? null)
  }, [accountId])

  const canUseNative = !!pool && isWNative(pool.asset) && !!nativeToken
  const needsAccount = hasSubAccounts && !selectedAccountId

  const { result, loading, executing, error, fetchAction, execute, resetState } =
    useActionExecution({
      actionType: 'Repay',
      pool,
      account,
      amount,
      isAll,
      payAsset: canUseNative && useNative ? zeroAddress : undefined,
      accountId: hasSubAccounts ? selectedAccountId ?? undefined : undefined,
    })

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setIsAll(false)
    setUseNative(false)
    resetState()
  }, [pool?.marketUid])

  const debtToken = userPosition
    ? parseAmount(userPosition.debt) + parseAmount(userPosition.debtStable)
    : 0
  const currentAmount = parseAmount(amount)
  const overMax = debtToken > 0 && currentAmount > debtToken + 1e-9

  const activeBal = canUseNative && useNative ? nativeBalance : walletBalance

  const handleQuickSelect = (val: string) => {
    setIsAll(false)
    setAmount(val)
  }

  const handleIsAllChange = (checked: boolean) => {
    setIsAll(checked)
    if (checked && debtToken > 0) {
      setAmount(formatTokenForInput(debtToken))
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
          label="Pay with"
        />
      )}

      {/* Wallet balance */}
      {activeBal && parseFloat(activeBal.balance) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Wallet balance:</span>
          <span className="font-medium">
            {formatTokenAmount(activeBal.balance)} (${formatUsd(activeBal.balanceUSD)})
          </span>
        </div>
      )}

      {/* Outstanding debt */}
      {userPosition && debtToken > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Outstanding debt:</span>
          <span className="text-error font-medium">
            {formatTokenAmount(debtToken)} (${formatUsd(userPosition.debtUSD + userPosition.debtStableUSD)})
          </span>
        </div>
      )}

      {/* Amount input with quick buttons */}
      <div className="form-control">
        <div className="flex justify-between items-center mb-1">
          <span className="label-text text-xs">Amount</span>
          <AmountQuickButtons maxAmount={debtToken} onSelect={handleQuickSelect} />
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

      {/* Repay full balance toggle */}
      <label className="label cursor-pointer justify-start gap-2 py-0">
        <input
          type="checkbox"
          className="checkbox checkbox-primary checkbox-xs"
          checked={isAll}
          onChange={(e) => handleIsAllChange(e.target.checked)}
        />
        <span className="label-text text-xs">Repay full balance</span>
      </label>

      {overMax && !isAll && (
        <div className="text-[10px] text-error">
          Exceeds repayable debt ({formatTokenAmount(debtToken)}).
        </div>
      )}

      {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={loading || !pool || !account || needsAccount}
        onClick={fetchAction}
      >
        {loading ? <span className="loading loading-spinner loading-xs" /> : 'Prepare Repay'}
      </button>

      {result && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executing}
          onClick={execute}
        >
          {executing ? <span className="loading loading-spinner loading-xs" /> : 'Execute Repay'}
        </button>
      )}
    </div>
  )
}

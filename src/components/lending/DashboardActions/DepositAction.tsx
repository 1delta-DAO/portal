import React, { useEffect, useState } from 'react'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { formatTokenAmount, formatUsd, parseAmount } from './format'
import { AmountQuickButtons } from './AmountQuickButtons'

export const DepositAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  walletBalance,
  lender,
  chainId,
  account,
}) => {
  const [amount, setAmount] = useState('')

  const { result, loading, executing, error, fetchAction, execute, resetState } =
    useActionExecution({
      actionType: 'Deposit',
      pool,
      lender,
      chainId,
      account,
      amount,
      isAll: false,
    })

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    resetState()
  }, [pool?.poolId])

  const walletAmount = walletBalance ? parseFloat(walletBalance.balance) : 0

  return (
    <div className="space-y-3">
      {/* Wallet balance */}
      {walletBalance && walletAmount > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Wallet balance:</span>
          <span className="font-medium">
            {formatTokenAmount(walletBalance.balance)} (${formatUsd(walletBalance.balanceUSD)})
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

      {result && (
        <button
          type="button"
          className="btn btn-success btn-sm w-full"
          disabled={executing}
          onClick={execute}
        >
          {executing ? <span className="loading loading-spinner loading-xs" /> : 'Execute Deposit'}
        </button>
      )}
    </div>
  )
}

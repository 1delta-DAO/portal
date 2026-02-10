import React, { useEffect, useState } from 'react'
import { isWNative } from '@1delta/lib-utils'
import { zeroAddress } from 'viem'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { formatTokenAmount, formatUsd } from './format'
import { AmountQuickButtons } from './AmountQuickButtons'
import { NativeCurrencySelector } from './NativeCurrencySelector'

export const DepositAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  walletBalance,
  account,
  nativeToken,
  nativeBalance,
}) => {
  const [amount, setAmount] = useState('')
  const [useNative, setUseNative] = useState(false)

  const canUseNative = !!pool && isWNative(pool.asset) && !!nativeToken

  const { result, loading, executing, error, fetchAction, execute, resetState } =
    useActionExecution({
      actionType: 'Deposit',
      pool,
      account,
      amount,
      isAll: false,
      payAsset: canUseNative && useNative ? zeroAddress : undefined,
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

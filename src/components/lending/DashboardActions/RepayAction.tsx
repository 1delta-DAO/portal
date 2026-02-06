import React, { useEffect, useState } from 'react'
import type { ActionPanelProps } from './types'
import { useActionExecution } from './useActionExecution'
import { formatTokenAmount, formatUsd } from './format'

export const RepayAction: React.FC<ActionPanelProps> = ({
  pool,
  userPosition,
  lender,
  chainId,
  account,
}) => {
  const [amount, setAmount] = useState('')
  const [isAll, setIsAll] = useState(false)

  const { result, loading, executing, error, fetchAction, execute, resetState } =
    useActionExecution({
      actionType: 'Repay',
      pool,
      lender,
      chainId,
      account,
      amount,
      isAll,
    })

  // Reset when pool changes
  useEffect(() => {
    setAmount('')
    setIsAll(false)
    resetState()
  }, [pool?.poolId])

  return (
    <div className="space-y-3">
      {/* User position context */}
      {userPosition && Number(userPosition.debt) > 0 && (
        <div className="text-xs flex justify-between px-1">
          <span className="text-base-content/60">Outstanding debt:</span>
          <span className="text-error font-medium">
            {formatTokenAmount(userPosition.debt)} (${formatUsd(userPosition.debtUSD)})
          </span>
        </div>
      )}

      {/* Amount input */}
      <div className="form-control">
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

      {/* Repay full balance toggle */}
      <label className="label cursor-pointer justify-start gap-2 py-0">
        <input
          type="checkbox"
          className="checkbox checkbox-primary checkbox-xs"
          checked={isAll}
          onChange={(e) => setIsAll(e.target.checked)}
        />
        <span className="label-text text-xs">Repay full balance</span>
      </label>

      {error && <div className="text-error text-xs wrap-break-word">{error}</div>}

      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        disabled={loading || !pool || !account}
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

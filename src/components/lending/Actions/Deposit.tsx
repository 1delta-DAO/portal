// src/components/lending/Actions/Deposit.tsx
import React from 'react'
import { useLenderSelection } from '../../../contexts/LenderSelectionContext'
import { AmountUsdHint } from '../UsdAmount'
import { ActionAmountInputProps, formatTokenForInput } from './common'

export const DepositAmountInput: React.FC<ActionAmountInputProps> = ({
  selection,
  simulated,
  onChangeAmount,
}) => {
  const { setSelectionUseCurrentBalance } = useLenderSelection()
  const amountUsd = simulated?.amountUsd

  // running single-asset balance after this step (token units)
  const runningToken =
    simulated?.assetBalanceBefore?.amount != null ? simulated.assetBalanceBefore.amount : 0
  const hasRunningBalance = Number.isFinite(runningToken) && runningToken > 0

  const handleUseBalance = () => {
    if (!hasRunningBalance) return
    // mark that this selection wants to follow running balance
    setSelectionUseCurrentBalance(selection.id, true)
    // still set a concrete amount for the input (so the user sees it);
    // your simulator can later prefer the flag over the numeric value if needed
    const val = formatTokenForInput(runningToken)
    onChangeAmount(val)
  }

  const handleChange = (v: string) => {
    // manual edit: don't auto-follow running balance anymore
    setSelectionUseCurrentBalance(selection.id, false)
    onChangeAmount(v)
  }

  const isFollowingBalance = !!selection.useCurrentBalance && hasRunningBalance

  return (
    <div className="form-control min-w-0">
      <div className="flex justify-between items-center mb-1">
        <span className="label-text text-xs">Amount</span>

        {hasRunningBalance && (
          <button
            type="button"
            className={`px-1.5 rounded-md text-[10px] text-base-content/70 hover:bg-base-200/80 hover:border-base-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 transition-colors ${
              isFollowingBalance ? 'bg-base-300/80 border-base-400' : ''
            }`}
            onClick={handleUseBalance}
            title="Use current running balance for this asset"
          >
            Running balance
          </button>
        )}
      </div>

      <div className="relative">
        <input
          type="text"
          className="input input-bordered input-sm w-full text-right pr-20"
          placeholder="0.0"
          value={selection.amount}
          onChange={(e) => handleChange(e.target.value)}
        />
        <AmountUsdHint amountUsd={amountUsd} />
      </div>
    </div>
  )
}

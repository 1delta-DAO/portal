// src/components/lending/Actions/Repay.tsx
import React from 'react'
import { useLenderSelection } from '../../../contexts/LenderSelectionContext'
import { AmountUsdHint } from '../UsdAmount'
import {
  ActionAmountInputProps,
  formatTokenForInput,
  getUserTokenStats,
  parseAmount,
} from './common'
import { AmountQuickButtons } from './QuickButton'

export const RepayAmountInput: React.FC<ActionAmountInputProps> = ({
  selection,
  pool,
  simulated,
  onChangeAmount,
}) => {
  const { setSelectionUseCurrentBalance } = useLenderSelection()
  const amountUsd = simulated?.amountUsd
  const { debtToken } = getUserTokenStats(pool)
  const currentAmount = parseAmount(selection.amount)
  const overMax = debtToken > 0 && currentAmount > debtToken + 1e-9

  // running single-asset balance after this step (token units)
  const runningToken =
    simulated?.assetBalanceAfter?.amount != null ? simulated.assetBalanceAfter.amount : 0
  const hasRunningBalance = Number.isFinite(runningToken) && runningToken > 0

  const handleQuickSelect = (val: string) => {
    // using predefined fraction: this is explicit, not "follow balance"
    setSelectionUseCurrentBalance(selection.id, false)
    onChangeAmount(val)
  }

  const handleUseBalance = () => {
    if (!hasRunningBalance) return
    // use the lesser of wallet balance and outstanding debt
    const cap = debtToken > 0 ? Math.min(debtToken, runningToken) : runningToken
    if (cap <= 0) return

    setSelectionUseCurrentBalance(selection.id, true)

    const val = formatTokenForInput(cap)
    onChangeAmount(val)
  }

  const handleInputChange = (v: string) => {
    // manual edit disables "follow running balance" intent
    setSelectionUseCurrentBalance(selection.id, false)
    onChangeAmount(v)
  }

  const isFollowingBalance = !!selection.useCurrentBalance && hasRunningBalance

  return (
    <div className="form-control min-w-0">
      <div className="flex justify-between items-center mb-1">
        <span className="label-text text-xs">Amount</span>

        <div className="flex items-center gap-1">
          {/* Position-based fractions (25/50/75/Max of debt) */}
          <AmountQuickButtons maxAmount={debtToken} onSelect={handleQuickSelect} />

          {/* Running-balance based max */}
          {hasRunningBalance && (
            <button
              type="button"
              className={`px-1.5 py-0.5 rounded-md text-[10px] text-base-content/70 hover:bg-base-200/80 hover:border-base-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 transition-colors ${
                isFollowingBalance ? 'bg-base-300/80 border-base-400' : ''
              }`}
              onClick={handleUseBalance}
              title="Use current running balance (capped by outstanding debt)"
            >
              Balance
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <input
          type="text"
          className="input input-bordered input-sm w-full text-right pr-20"
          placeholder="0.0"
          value={selection.amount}
          onChange={(e) => handleInputChange(e.target.value)}
        />
        <AmountUsdHint amountUsd={amountUsd} />
      </div>

      {overMax && (
        <div className="mt-1 text-[10px] text-error">
          Exceeds repayable debt (
          {debtToken.toLocaleString(undefined, {
            maximumFractionDigits: 4,
          })}
          ).
        </div>
      )}
    </div>
  )
}

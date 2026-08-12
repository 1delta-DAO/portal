import React from 'react'
import { LendingMode } from '../../../../../lib/lib-utils'
import type { TradingActionProps } from '../types'
import { SwapLikeAction, type SwapLikeConfig } from './SwapLikeAction'

/**
 * Move debt from one asset to another in a single transaction.
 *
 * Both slots are borrowable-side, so the form leads with the REPAY leg: you
 * know how much debt you want gone, and the range endpoint bounds that leg
 * (`amountOutStr`). No `isAll` — the flash-loan leg is bounded by the debt
 * itself rather than by a balance the server would re-read.
 *
 * The form itself is {@link SwapLikeAction}, shared with `ColSwapAction`.
 */
const DEBT_SWAP: SwapLikeConfig = {
  operation: 'DebtSwap',
  rangeOperation: 'debt-swap',
  side: 'borrowable',
  role: 'debt',
  positionType: 'debt',
  lendingMode: LendingMode.VARIABLE,
  exactFieldDefault: 'output',
  maxField: 'output',
  maxFrom: 'amountOutStr',
  supportsIsAll: false,
  labels: {
    in: 'Borrow (New Debt)',
    out: 'Repay (Existing Debt)',
    fetchQuotes: 'Get Debt Swap Quotes',
    execute: 'Execute Debt Swap',
    rateImpactIn: '(New Debt)',
    rateImpactOut: '(Repaid)',
  },
}

export const DebtSwapAction: React.FC<TradingActionProps> = (props) => (
  <SwapLikeAction {...props} config={DEBT_SWAP} />
)

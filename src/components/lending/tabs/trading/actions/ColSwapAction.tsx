import React from 'react'
import { LendingMode } from '../../../../../lib/lib-utils'
import type { TradingActionProps } from '../types'
import { SwapLikeAction, type SwapLikeConfig } from './SwapLikeAction'

/**
 * Exchange one collateral asset for another in a single transaction.
 *
 * Both slots are collateral-side, so the form leads with the WITHDRAW leg: you
 * know how much collateral you want to move, and the range endpoint bounds
 * that leg (`amountInStr`). `isAll` is supported here because a max-out
 * withdraw is sized against a balance the server re-reads.
 *
 * The form itself is {@link SwapLikeAction}, shared with `DebtSwapAction`.
 */
const COL_SWAP: SwapLikeConfig = {
  operation: 'ColSwap',
  rangeOperation: 'collateral-swap',
  side: 'collateral',
  role: 'collateral',
  positionType: 'deposits',
  lendingMode: LendingMode.NONE,
  exactFieldDefault: 'input',
  maxField: 'input',
  maxFrom: 'amountInStr',
  supportsIsAll: true,
  labels: {
    in: 'Collateral In (Withdraw)',
    out: 'Collateral Out (Deposit)',
    fetchQuotes: 'Get Collateral Swap Quotes',
    execute: 'Execute Collateral Swap',
    rateImpactIn: '(Swap From)',
    rateImpactOut: '(Swap Into)',
  },
}

export const ColSwapAction: React.FC<TradingActionProps> = (props) => (
  <SwapLikeAction {...props} config={COL_SWAP} />
)

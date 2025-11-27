import { applyBorrowDelta } from './deltasBorrow'
import { applyDepositDelta } from './deltasDeposit'
import { applyRepayDelta } from './deltasRepay'
import { applyWithdrawDelta } from './deltasWithdraw'
import { AdjustForActionFn } from './simulateLenderSelections'

export const adjustForAction: AdjustForActionFn = (
  balanceIn,
  pool,
  amountUsd,
  action,
  userConfig
) => {
  switch (action) {
    case 'deposit':
      return applyDepositDelta(balanceIn, pool, amountUsd, userConfig)
    case 'withdraw':
      return applyWithdrawDelta(balanceIn, pool, amountUsd, userConfig)
    case 'borrow':
      return applyBorrowDelta(balanceIn, pool, amountUsd, userConfig)
    case 'repay':
      return applyRepayDelta(balanceIn, pool, amountUsd, userConfig)
    default:
      // exhaustive guard – if TS is happy, this is never hit
      return balanceIn
  }
}

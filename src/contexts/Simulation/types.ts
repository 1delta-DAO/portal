import { BalanceData } from '@1delta/margin-fetcher'
import { LenderOperationKind, LenderOperationSelection } from '../LenderSelectionContext'
import { FlattenedPoolWithUserData } from '../../hooks/lending/prepareMixedData'
import { PoolDataItem } from '../../hooks/lending/usePoolData'

export interface SimulatedActionState {
  selectionId: string
  lender: string
  subAccount: string
  poolId: string
  operation: LenderOperationKind
  amount: string
  amountUsd: number
  balanceBefore: BalanceData
  balanceAfter: BalanceData
}

export interface SimulationResult {
  /** Step-by-step view that your UI can show */
  steps: SimulatedActionState[]
  /** Final balances per lender + subAccount after all simulated actions */
  finalByLender: {
    [lender: string]: {
      [subAccount: string]: BalanceData
    }
  }
}

/**
 * Caller-provided helper that converts a selection & pool into a USD amount.
 * You can use pool.price, or your own pricing logic here.
 */
export type AmountUsdResolver = (
  selection: LenderOperationSelection,
  pool: FlattenedPoolWithUserData
) => number

/**
 * Your black-box adjust function (already implemented by you)
 */
export type AdjustForActionFn = (
  balanceIn: BalanceData,
  pool: PoolDataItem,
  amountUsd: number,
  action: LenderOperationKind
) => BalanceData

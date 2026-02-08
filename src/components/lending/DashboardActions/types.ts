import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import type { TokenBalance } from '../../../hooks/lending/useTokenBalances'
import type { LendingActionResponse } from '../../../sdk/lending-helper/fetchLendingAction'

export type ActionType = 'Deposit' | 'Withdraw' | 'Borrow' | 'Repay'

export interface ActionPanelProps {
  pool: PoolDataItem | null
  userPosition: UserPositionEntry | null
  walletBalance?: TokenBalance | null
  lender: string
  chainId: string
  account?: string
  /** Sub-account ID for lenders with multiple sub-accounts (e.g. INIT) */
  accountId?: string
}

export interface ActionState {
  amount: string
  isAll: boolean
  result: LendingActionResponse | null
  loading: boolean
  executing: boolean
  error: string | null
}

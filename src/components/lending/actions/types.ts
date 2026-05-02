import type { RawCurrency } from '../../../types/currency'
import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry, UserSubAccount } from '../../../hooks/lending/useUserData'
import type { TokenBalance } from '../../../hooks/lending/useTokenBalances'
import type { LendingActionResponse } from '../../../sdk/lending-helper/fetchLendingAction'

export type ActionType = 'Deposit' | 'Withdraw' | 'Borrow' | 'Repay'

export interface ActionPanelProps {
  pool: PoolDataItem | null
  userPosition: UserPositionEntry | null
  walletBalance?: TokenBalance | null
  account?: string
  chainId: string
  /** Sub-account ID for lenders with multiple sub-accounts (e.g. INIT) */
  accountId?: string
  /** All sub-accounts for the current lender (for sub-account selector) */
  subAccounts?: UserSubAccount[]
  /** Lender key string (e.g. 'INIT') for detecting multi-account support */
  lenderKey?: string
  /** Native token info (from chainTokens[zeroAddress]), only provided when pool asset is wrapped native */
  nativeToken?: RawCurrency | null
  /** Native token wallet balance */
  nativeBalance?: TokenBalance | null
  /** Active sub-account — used to send balance/apr data for simulation */
  subAccount?: UserSubAccount
  /** Whether wallet balances are currently being fetched */
  isBalancesFetching?: boolean
  /** Manually trigger a wallet balance refresh */
  refetchBalances?: () => void
  /** Hide health-factor projection and rate-impact indicator (used by the plain earn flow) */
  hideSimulation?: boolean
}

export interface ActionState {
  amount: string
  isAll: boolean
  result: LendingActionResponse | null
  loading: boolean
  executing: boolean
  error: string | null
}

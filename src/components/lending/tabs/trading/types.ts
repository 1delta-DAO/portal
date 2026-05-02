import type { PoolDataItem } from '../../../../hooks/lending/usePoolData'
import type { UserPositionEntry, UserSubAccount } from '../../../../hooks/lending/useUserData'
import type { TokenBalance } from '../../../../hooks/lending/useTokenBalances'

export type TradingOperation = 'Loop' | 'ColSwap' | 'DebtSwap' | 'Close'
export type PoolRole = 'input' | 'output' | 'pay'

export interface SelectedPool {
  pool: PoolDataItem
  role: PoolRole
}

export interface TableHighlight {
  marketUid: string
  role: PoolRole
}

export interface Tx {
  to: string
  data: string
  value: string
  description?: string
}

export interface TradingQuote {
  aggregator: string
  tradeAmountIn: number
  tradeAmountOut: number
  positionCollateralUSD?: number
  positionDebtUSD?: number
  tx: Tx
}

export interface QuoteResponse {
  success: boolean
  data: { quotes: TradingQuote[] } | null
  actions: { transactions: Tx[]; permissions: Tx[] } | null
}

/**
 * Optional pre-filled selection passed in from a deep link (e.g. the
 * Optimizer's "Loop this" button). Each leg is matched against the lender's
 * pools by underlying address upstream and resolved to a `PoolDataItem`.
 */
export interface InitialActionSelection {
  collateralPool?: PoolDataItem
  debtPool?: PoolDataItem
  /** Token-unit amount the user typed in the optimizer (collateral side). */
  amount?: number
}

export interface TradingActionProps {
  allPools: PoolDataItem[]
  /** All pools (dropdowns show all, with preferred ones bumped to top). */
  collateralPools: PoolDataItem[]
  /** All pools (dropdowns show all, with preferred ones bumped to top). */
  borrowablePools: PoolDataItem[]
  /** MarketUids from the active config group — shown first in the collateral dropdown. */
  preferredCollateralUids: Set<string>
  /** MarketUids from the active config group — shown first in the borrowable dropdown. */
  preferredBorrowableUids: Set<string>
  userPositions: Map<string, UserPositionEntry>
  walletBalances: Map<string, TokenBalance>
  subAccounts: UserSubAccount[]
  selectedLender: string
  chainId: string
  account?: string
  accountId?: string
  isBalancesFetching?: boolean
  refetchBalances?: () => void
  onAccountIdChange: (accountId: string | null) => void
  onPoolSelectionChange: (selections: SelectedPool[]) => void
  /** Deep-link seed (e.g. Optimizer → Loop). Consumed once on mount. */
  initialSelection?: InitialActionSelection
}

import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry, UserSubAccount } from '../../../hooks/lending/useUserData'
import type { TokenBalance } from '../../../hooks/lending/useTokenBalances'

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

export interface TradingActionProps {
  allPools: PoolDataItem[]
  /** Pools available as collateral (filtered by selected config, or all pools if no config). */
  collateralPools: PoolDataItem[]
  /** Pools available as borrowable (filtered by selected config, or all pools if no config). */
  borrowablePools: PoolDataItem[]
  userPositions: Map<string, UserPositionEntry>
  walletBalances: Map<string, TokenBalance>
  subAccounts: UserSubAccount[]
  selectedLender: string
  chainId: string
  account?: string
  accountId?: string
  onAccountIdChange: (accountId: string | null) => void
  onPoolSelectionChange: (selections: SelectedPool[]) => void
}

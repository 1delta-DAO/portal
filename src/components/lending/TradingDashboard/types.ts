import type { PoolDataItem } from '../../../hooks/lending/usePoolData'
import type { UserPositionEntry } from '../../../hooks/lending/useUserData'
import type { TokenBalance } from '../../../hooks/lending/useTokenBalances'

export type TradingOperation = 'Loop' | 'ColSwap' | 'DebtSwap' | 'Close'
export type PoolRole = 'input' | 'output' | 'pay'

export interface SelectedPool {
  pool: PoolDataItem
  role: PoolRole
}

export interface TableHighlight {
  poolId: string
  role: PoolRole
}

export interface Tx {
  to: string
  data: string
  value: string
  info?: string
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
  quotes: TradingQuote[]
  permissionTxns: Tx[]
}

export interface TradingActionProps {
  allPools: PoolDataItem[]
  userPositions: Map<string, UserPositionEntry>
  walletBalances: Map<string, TokenBalance>
  selectedLender: string
  chainId: string
  account?: string
  accountId?: string
  onPoolSelectionChange: (selections: SelectedPool[]) => void
}

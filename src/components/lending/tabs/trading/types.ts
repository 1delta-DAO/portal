import type { PoolDataItem } from '../../../../hooks/lending/usePoolData'
import type { UserPositionEntry, UserSubAccount } from '../../../../hooks/lending/useUserData'
import type { TokenBalance } from '../../../../hooks/lending/useTokenBalances'

export type TradingOperation = 'Loop' | 'ColSwap' | 'DebtSwap' | 'Close'
export type PoolRole = 'input' | 'output' | 'pay'
/** Which view-side of a pool the selection applies to. By-config splits the
 *  same `marketUid` into a Collateral row and a Borrowable row, so the role
 *  highlight needs the side to land on the correct one. */
export type PoolSide = 'collateral' | 'borrowable'

export interface SelectedPool {
  pool: PoolDataItem
  role: PoolRole
  /** Which row in the by-config table this selection should highlight. */
  side: PoolSide
}

export interface TableHighlight {
  marketUid: string
  role: PoolRole
  side: PoolSide
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
  /** USD value of the input leg of the swap (absolute). */
  tradeAmountInUSD?: number
  /** USD value of the output leg of the swap (absolute). */
  tradeAmountOutUSD?: number
  /** outUSD - inUSD (negative = swap costs the user). */
  priceImpactUSD?: number
  /** priceImpactUSD / inUSD as a fraction (e.g. -0.044 for -4.4%). */
  priceImpactPct?: number
  /** Resolved input asset metadata from the deltas (preferred over caller-supplied props). */
  inSymbol?: string
  inLogoURI?: string
  /** Resolved output asset metadata from the deltas. */
  outSymbol?: string
  outLogoURI?: string
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

/** Buffered click on a by-config row — routed to the active action's
 *  matching slot via a useEffect. The `nonce` lets the same row clicked
 *  twice still trigger an apply (otherwise the prop reference would be
 *  stable and the effect wouldn't re-run). */
export interface PendingMarketClick {
  pool: PoolDataItem
  side: PoolSide
  nonce: number
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
  /** Click on a by-config row. Each action implements its own routing logic
   *  (which slot to fill) and calls `consumeMarketClick` once applied. */
  pendingMarketClick?: PendingMarketClick | null
  consumeMarketClick?: () => void
}

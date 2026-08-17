import type { PoolDataItem } from '../../../../sdk/lending-helper/marketTypes'
import type {
  UserPositionEntry,
  UserSubAccount,
} from '../../../../sdk/lending-helper/userPositionTypes'
import type { TokenBalance } from '../../../../hooks/lending/useTokenBalances'
import type { RateImpactEntry } from '../../../../sdk/lending-helper/fetchLendingAction'

/** Role of a market in the active operation — picks which rate to surface
 *  on the quote card (debt → borrow APR, collateral → deposit APR). */
/** One position delta of a quote, retained per leg (the flattened
 *  positionCollateralUSD/positionDebtUSD pair loses same-role ops). */
export interface QuotePositionDelta {
  assetAddress?: string
  symbol?: string
  position: string
  amountUSD: number
}

export interface QuoteMarketRole {
  role: 'debt' | 'collateral'
  symbol?: string
  /** Underlying asset address — pairs this market's role with its quote delta. */
  assetAddress?: string
  /** Intrinsic (native/staking) yield of the market's asset, percent units.
   *  Folded into the displayed rate — earned by depositors, paid by borrowers. */
  intrinsicYield?: number
  /** Side-appropriate reward APR (percent): deposit incentive for collateral
   *  roles, borrow rebate for debt roles. Shown as a transient badge. */
  rewardApr?: number
  /** Current base deposit APR (percent) from pool data. Used to synthesize a
   *  flat (no-shift) entry when the backend has no IRM item for this market —
   *  e.g. Compound V3 Comet collateral, which has no rate curve at all. */
  depositRatePct?: number
  /** Current base borrow APR (percent) from pool data — same fallback role. */
  borrowRatePct?: number
}

export type TradingOperation = 'Loop' | 'ColSwap' | 'DebtSwap' | 'Refinance' | 'Close'
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
  /** Value gained vs given up (negative = costs the user). For swaps this is
   *  outUSD − inUSD; for Loop it's (collateral − debt − margin) so the zapped-in
   *  margin isn't mistaken for a penalty. */
  priceImpactUSD?: number
  /** priceImpactUSD as a fraction of the trade size (inUSD for swaps, collateral
   *  for Loop), e.g. -0.044 for -4.4%. */
  priceImpactPct?: number
  /** Resolved input asset metadata from the deltas (preferred over caller-supplied props). */
  inSymbol?: string
  inLogoURI?: string
  /** Resolved output asset metadata from the deltas. */
  outSymbol?: string
  outLogoURI?: string
  positionCollateralUSD?: number
  positionDebtUSD?: number
  /** All position deltas of this quote, one per leg. */
  positionDeltas?: QuotePositionDelta[]
  /** Per-quote projected rate impact (this quote's own trade amounts). */
  rateImpact?: RateImpactEntry[]
  /**
   * CLOSE only — where the collateral sale actually went.
   *
   * A close does NOT hand the whole sale to the debt: it clears the debt and
   * sweeps the rest back to the wallet, and an `isAll` withdraws slightly more
   * collateral than it swaps (a 2 bps sizing skim) which also comes back. So
   * the position legs and the swap legs are different quantities, and reading
   * either as the other misstates the trade — it showed a −27.5 % "impact" on a
   * close that was simply returning money.
   */
  closeSplit?: {
    /** Debt actually retired, in USD. */
    debtRepaidUSD: number
    /** Loan token returned to the wallet, in USD. */
    loanReturnedUSD: number
    /** Collateral returned to the wallet (the `isAll` skim), in USD. */
    collateralReturnedUSD: number
    /** Everything the user gets back in the wallet. */
    returnedTotalUSD: number
  }
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

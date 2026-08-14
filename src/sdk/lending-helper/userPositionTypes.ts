/**
 * The user-position model for `/v1/data/lending/user-positions`.
 *
 * A user's holdings on one lender, on one chain, split into sub-accounts (the
 * per-position isolation Euler, Fluid and Aave-style protocols expose). Lives
 * here rather than in the hook that fetches it so the model is readable
 * without reading a React Query hook — same rule as `poolTypes.ts` and
 * `marketTypes.ts`.
 *
 * The `is*Position` predicates ship alongside the types on purpose: the
 * distinction between a per-loan entry, an aggregate-debt entry and a
 * collateral entry is not visible from the field names, and reading a brokered
 * position wrong is a correctness bug rather than a display one.
 */

/**
 * Sentinel `loanId` for the flex/dynamic broker loan: `type(uint128).max`.
 * The variable-rate position a brokered market can carry is addressed by this
 * id rather than a per-term posId. See BROKERED_MARKETS.md §6.
 */
export const FLEX_LOAN_ID = '340282366920938463463374607431768211455'

/**
 * Per-loan metadata for a brokered (fixed-term) lending market — Lista DAO on
 * BNB. Present only on the per-loan position entries; aggregate-debt and
 * collateral entries leave `term` undefined. See BROKERED_MARKETS.md.
 */
export interface LoanTerm {
  /** The loan's on-chain posId — the repay target (`?loanId=`). */
  loanId: string
  /** Broker term identifier (the borrow target, `?termId=`). Absent for flex. */
  termId?: number
  /** True for the variable/flex loan (the `FLEX_LOAN_ID` sentinel). */
  isDynamic: boolean
  /** Fixed rate, percent. Absent for the flex loan (use market variable rate). */
  apr?: number
  /** Lock duration in days. Absent for flex. */
  termDays?: number
  /** Unix seconds at which the fixed term matures. Absent for flex. */
  maturity?: number
  /** Interest accrued so far (already included in the loan's debt), token units. */
  accruedInterest?: string
  /** Penalty to close before maturity (~half the remaining-term interest); 0 once matured. */
  earlyRepayPenalty?: string
  /** True once `maturity` has passed — interest frozen; do NOT treat as closed. */
  isMatured?: boolean
  // --- static-face-value fixed-term detail (Exactly) ---
  /** Amount owed AT maturity (principal + fee). Static — no accrual index. */
  faceValue?: string
  /** Rebate for repaying BEFORE maturity (`faceValue - debt`); can be 0. */
  earlyRepayDiscount?: string
  /** Penalty accrued past maturity (`debt - faceValue`). */
  latePenalty?: string
  /** Further penalty per day overdue — LINEAR on face, not compounding. */
  latePenaltyPerDay?: string
  /** Annualized late-penalty rate, percent (~164%/yr on Exactly). */
  latePenaltyApr?: number
  /** Seconds past maturity; 0 until overdue. */
  secondsLate?: number
}

export interface UserPositionEntry {
  marketUid: string
  underlying?: string
  /**
   * The loan's posId. Only set on per-loan entries of a brokered market; the
   * aggregate-debt and collateral entries leave it undefined. Multiple entries
   * in one sub-account can share `marketUid` (the aggregate + each loan) — so
   * `marketUid` is NOT a unique key once brokered markets are present. Key
   * per-loan rows by `${marketUid}|${loanId}` and dedupe per-market lookups to
   * the non-`term` (aggregate) row. See {@link isLoanPosition}.
   */
  loanId?: string
  /** Fixed-term metadata; present iff this is a per-loan brokered entry. */
  term?: LoanTerm
  deposits: number | string
  debtStable: number | string
  debt: number | string
  depositsUSD: number
  debtStableUSD: number
  debtUSD: number
  depositsUSDOracle?: number
  debtStableUSDOracle?: number
  debtUSDOracle?: number
  stableBorrowRate?: string
  collateralEnabled: boolean
  claimableRewards: number
  /**
   * Morpho Midnight only: continuous fee accrued on a lender's supply position,
   * in loan-token units. Already deducted from `deposits` (net = credit −
   * pendingFee). Absent / 0 on every other lender and on markets with no
   * continuous fee (the current live default).
   */
  pendingFee?: number | string
  withdrawable: number | string
  borrowable: number | string
  isAllowed?: boolean
  /**
   * LlamaLend only, on the DEBT row: the position's soft-liquidation state and
   * — the field consumed here — `bandCount`, the `N` the loan was opened at.
   * `N` is IMMUTABLE for the life of the loan (changing it means closing and
   * reopening), which is why the band-setter control must render LOCKED at
   * this value whenever such a position exists, never as an editable default.
   */
  llamalendInfo?: {
    bandCount?: number
    bands?: [number, number]
    softLiquidating?: boolean
    version?: 1 | 2
  } & Record<string, unknown>
  underlyingInfo?: {
    asset: {
      chainId: string
      address: string
      symbol: string
      name: string
      decimals: number
      logoURI: string
      assetGroup: string
      currencyId: string
      props?: Record<string, unknown> | null
    }
    oraclePrice: { oraclePrice: number | null; oraclePriceUsd: number | null } | null
    prices: Record<string, unknown> | null
  }
}

export interface UserBalanceData {
  borrowDiscountedCollateral?: number
  borrowDiscountedCollateralAllActive?: number
  collateral: number
  collateralAllActive: number
  deposits: number
  debt: number
  adjustedDebt?: number
  nav: number
  deposits24h: number
  debt24h: number
  nav24h: number
  rewards?: Record<string, unknown>
}

export interface UserAprData {
  apr: number
  borrowApr: number
  depositApr: number
  rewards: Record<string, unknown>
  rewardApr: number
  rewardDepositApr: number
  rewardBorrowApr: number
  intrinsicApr: number
  intrinsicDepositApr: number
  intrinsicBorrowApr: number
}

export interface UserConfigEntry {
  selectedMode: number
  id: string
  isWhitelisted: boolean
}

export interface UserSubAccount {
  health: number | null
  borrowCapacityUSD: number
  accountId: string
  balanceData: UserBalanceData
  aprData: UserAprData
  userConfig: UserConfigEntry
  positions: UserPositionEntry[]
}

// ============================================================================
// Brokered (fixed-term) position classification
//
// A brokered market's `positions[]` carries three kinds of entry that share a
// `marketUid`-space: the aggregate-debt rollup, the shared collateral, and one
// per-loan row per fixed (and the flex) loan. These helpers split them so
// per-market lookups use the aggregate and the loan list uses the per-loan
// rows — never both, or totals double-count. See BROKERED_MARKETS.md.
// ============================================================================

/** True for a per-loan brokered entry (the repay-target rows). */
export function isLoanPosition(p: UserPositionEntry): boolean {
  return p.term != null
}

/** True for the flex/dynamic loan row (variable slot, sentinel loanId). */
export function isFlexLoanPosition(p: UserPositionEntry): boolean {
  return p.term?.isDynamic === true
}

/**
 * True for the rows that represent a whole market (aggregate-debt rollup or
 * the shared collateral) — i.e. everything that is NOT a per-loan breakdown.
 * These are the rows that should populate a `Map<marketUid, …>`; the per-loan
 * rows would otherwise collide on `marketUid`.
 */
export function isAggregatePosition(p: UserPositionEntry): boolean {
  return p.term == null
}

/** True iff this sub-account holds any brokered (fixed-term) loan. */
export function hasBrokeredLoans(sub: UserSubAccount): boolean {
  return sub.positions.some((p) => typeof p === 'object' && p !== null && isLoanPosition(p))
}

/**
 * The band count of an OPEN LlamaLend loan on this position entry, else
 * undefined.
 *
 * Gated on live debt, not on the info block alone: the debt row keeps its
 * `llamalendInfo` after a full repay (as a lend-side descriptor), and a closed
 * loan's stale `N` must not lock the setter for the next open — where the
 * borrower is free to choose again.
 */
export function openLoanBandCount(p: UserPositionEntry | null | undefined): number | undefined {
  if (!p || !(Number(p.debt) > 0)) return undefined
  const n = p.llamalendInfo?.bandCount
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * True when this sub-account's "mode" slot carries a POSITION PARAMETER
 * (LlamaLend's band count) rather than an e-mode category — i.e. any of its
 * rows is LlamaLend-shaped. Rendering the raw number as "Mode #4" misreads a
 * band count as a borrow-mode id, and offering a mode SWITCH for it is
 * meaningless (`N` is fixed at open; changing it is a close + reopen).
 */
export function hasParameterizedMode(sub: UserSubAccount | null | undefined): boolean {
  return !!sub?.positions.some(
    (p) => typeof p === 'object' && p !== null && p.llamalendInfo != null
  )
}

/** The per-loan rows for a given market, in payload order. */
export function loansForMarket(
  positions: UserPositionEntry[],
  marketUid: string
): UserPositionEntry[] {
  return positions.filter(
    (p) => typeof p === 'object' && p !== null && p.marketUid === marketUid && isLoanPosition(p)
  )
}

export interface UserLenderInfo {
  lenderKey: string
  name: string
  logoUri?: string
}

export interface LenderUserDataEntry {
  account: string
  chainId: string
  lender: string
  balanceData: UserBalanceData
  aprData: UserAprData
  healthFactor: number | null
  leverage: number
  lenderInfo?: UserLenderInfo
  data: UserSubAccount[]
}

// ============================================================================
// Summary from the API
// ============================================================================

export interface ChainSummary {
  chainId: string
  totalDepositsUSD: number
  totalDebtUSD: number
  netWorth: number
  lenderCount: number
}

export interface UserDataSummary {
  balanceData: UserBalanceData
  aprData: UserAprData
  overallLeverage: number
  activeLenders: number
  activeChains: number
  chains: ChainSummary[]
}

// ============================================================================
// Result type
// ============================================================================

export interface UserDataResult {
  /** Flat array of per-lender entries */
  raw: LenderUserDataEntry[] | undefined
  /** Pre-computed summary from the API */
  summary: UserDataSummary | undefined
}

// ============================================================================
// Raw API response type (no top-level balanceData/aprData/healthFactor)
// ============================================================================

export interface RawLenderUserDataEntry {
  account: string
  chainId: string
  lender: string
  balanceData?: UserBalanceData
  aprData?: UserAprData
  healthFactor?: number | null
  leverage?: number
  lenderInfo?: UserLenderInfo
  data: UserSubAccount[]
}

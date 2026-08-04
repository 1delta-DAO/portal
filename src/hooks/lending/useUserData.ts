import { useQuery } from '@tanstack/react-query'
import { fetchUserDataViaRpc } from './fetchUserDataRpc'

// ============================================================================
// Types for the /lending/user-positions API response
// ============================================================================

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

// ============================================================================
// Transform
// ============================================================================

const ZERO_BALANCE_DATA: UserBalanceData = {
  collateral: 0,
  collateralAllActive: 0,
  deposits: 0,
  debt: 0,
  nav: 0,
  deposits24h: 0,
  debt24h: 0,
  nav24h: 0,
}

const ZERO_APR_DATA: UserAprData = {
  apr: 0,
  borrowApr: 0,
  depositApr: 0,
  rewards: {},
  rewardApr: 0,
  rewardDepositApr: 0,
  rewardBorrowApr: 0,
  intrinsicApr: 0,
  intrinsicDepositApr: 0,
  intrinsicBorrowApr: 0,
}

function transformUserDataEntry(raw: RawLenderUserDataEntry): LenderUserDataEntry {
  const subs = raw.data ?? []

  // Use top-level if provided, otherwise derive from first sub-account
  const balanceData = raw.balanceData ?? (subs.length > 0 ? subs[0].balanceData : ZERO_BALANCE_DATA)
  const aprData = raw.aprData ?? (subs.length > 0 ? subs[0].aprData : ZERO_APR_DATA)
  const healthFactor = raw.healthFactor !== undefined ? raw.healthFactor : (subs[0]?.health ?? null)
  const leverage =
    raw.leverage ??
    (balanceData.deposits > 0 && balanceData.nav > 0 ? balanceData.deposits / balanceData.nav : 0)

  return {
    account: raw.account,
    chainId: raw.chainId,
    lender: raw.lender,
    balanceData,
    aprData,
    healthFactor,
    leverage,
    lenderInfo: raw.lenderInfo,
    data: subs,
  }
}

// ============================================================================
// Endpoint
// ============================================================================

import { BACKEND_BASE_URL } from '../../config/backend'

const endpointUserData = `${BACKEND_BASE_URL}/v1/data/lending/user-positions`

// Global override: when true, every chain fetches user positions via the
// prepare → client eth_call → parse flow instead of letting the API read chain
// state server-side. Set VITE_USER_POSITIONS_RPC=true to flip it without a
// code change; the per-chain list below applies either way.
const USE_RPC_FETCH = import.meta.env.VITE_USER_POSITIONS_RPC === 'true'

// Per-chain override: these chains always fetch user positions locally via RPC,
// regardless of USE_RPC_FETCH. Used for chains the API does not (yet) serve well.
//   1329 = SEI Network, 1868 = SONEIUM, 1672 = Pharos, 4663 = Robinhood Chain
const FORCE_RPC_FETCH_CHAINS = new Set<string>(['1329', '1868', '1672', '4663'])

// Chains that must keep using the API even when USE_RPC_FETCH is on — an
// escape hatch for chains whose public RPCs can't serve the multicall.
const FORCE_API_FETCH_CHAINS = new Set<string>()

/** Whether to fetch user positions via RPC (vs the API) for a given chain. */
function shouldUseRpcFetch(chainId: string): boolean {
  if (FORCE_API_FETCH_CHAINS.has(chainId)) return false
  return USE_RPC_FETCH || FORCE_RPC_FETCH_CHAINS.has(chainId)
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useUserData
 * Fetches user lending positions from the /lending/user-positions endpoint.
 *
 * Accepts either a single `chainId` or a `chainIds` list — the endpoint takes
 * a `chains` CSV natively and tags every entry with its `chainId`, so a
 * multi-chain read is one request. Consumers rendering a mixed-chain list must
 * act on `entry.chainId`, never on the tab's selection, or they will build
 * transactions against the wrong chain.
 */
export function useUserData(params: {
  chainId?: string
  chainIds?: string[]
  account?: string
  enabled?: boolean
  lenders?: string[]
}) {
  const { account, lenders } = params
  const chainIds = params.chainIds?.length
    ? params.chainIds
    : params.chainId
      ? [params.chainId]
      : []
  // Sorted so a reordered selection hits the same cache entry.
  const chainsKey = [...chainIds].sort().join(',')
  const enabled = (params.enabled ?? true) && !!account && chainIds.length > 0

  const lendersKey = lenders && lenders.length > 0 ? [...lenders].sort().join(',') : ''
  const lendersQuery = lendersKey ? `&lenders=${lendersKey}` : ''
  const url = `${endpointUserData}?chains=${chainsKey}&account=${account}${lendersQuery}`

  const { data, isLoading, isFetching, error, refetch } = useQuery<UserDataResult>({
    queryKey: ['userData', chainsKey, account, lendersKey],
    enabled,
    queryFn: async () => {
      // If any selected chain needs the RPC path, the whole selection goes
      // through it. Splitting the read would mean merging two server-computed
      // summaries — summing balances and re-deriving weighted APRs by hand —
      // whereas the prepare endpoint happily takes every chain at once and
      // returns one coherent summary.
      if (chainIds.some(shouldUseRpcFetch)) {
        const result = await fetchUserDataViaRpc(chainIds, account!, lenders)
        return {
          raw: result.data.map(transformUserDataEntry),
          summary: result.summary,
        }
      }

      const r = await fetch(url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`)
      }
      const json = (await r.json()) as {
        success: boolean
        data: { items: RawLenderUserDataEntry[]; summary: UserDataSummary }
        error?: { code: string; message: string }
      }
      if (!json.success) {
        throw new Error(json.error?.message ?? 'API returned success: false')
      }
      return {
        raw: json.data.items.map(transformUserDataEntry),
        summary: json.data.summary,
      }
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  return {
    userData: data ?? { raw: undefined, summary: undefined },
    isUserDataLoading: isLoading,
    isUserDataFetching: isFetching,
    error,
    refetch,
  }
}

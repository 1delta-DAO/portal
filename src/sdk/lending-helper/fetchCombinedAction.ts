import { apiFetchEnvelope, errorMessage, type ApiTransaction, type ApiPermission } from '../http'
import type { LendingActionSimulation, RateImpactEntry } from './fetchLendingAction'

// ============================================================================
// Combined one-shot lending actions:
//   POST|GET /v1/actions/lending/deposit-and-borrow   (supply collateral + borrow)
//   POST|GET /v1/actions/lending/withdraw-and-repay   (repay debt + withdraw)
//
// The worker envelope matches the single-action endpoints:
//   json.actions.transactions[]  — ordered txs (native/composer = 1, sequential = N)
//   json.actions.permissions[]   — approvals / authorizations to run first
//   json.data.{ route, atomic, simulation, reveals }
// `route` is 'native' | 'composer' | 'sequential' | 'auction'.
// ============================================================================

export type CombinedTransaction = ApiPermission

export interface TermBidReveal {
  id: string
  seed: string
  price: string
  nonce: string
}

/**
 * Inverse FiRM only: the account's DBR state after the built action.
 * Interest on FiRM is PREPAID in DBR (1 DBR = 1 DOLA-year, so the yearly
 * burn equals the post-action debt). A `deficit > 0` account is
 * force-replenishable at ~54.75% APR onto principal AND has its
 * withdrawals frozen — the UI must prompt a DBR purchase before the
 * runway ends, not after.
 */
export interface InverseDbrState {
  /** DBR wallet balance (raw 1e18). */
  balance: string
  /** DBR deficit (raw 1e18) — > 0 is the distressed state. */
  deficit: string
  /** DBR burned per year at the post-action debt (raw 1e18 = DOLA debt). */
  yearlyBurn: string
  /** Seconds the current balance lasts at the post-action debt. */
  runwaySeconds: string
}

export interface CombinedActionResponse {
  transactions: CombinedTransaction[]
  permissions: CombinedTransaction[]
  route?: 'native' | 'composer' | 'sequential' | 'auction'
  atomic?: boolean
  simulation?: LendingActionSimulation
  rateImpact?: RateImpactEntry[]
  /** Term auction only — sealed-bid reveal tickets the caller must persist. */
  reveals?: TermBidReveal[]
  /** Inverse FiRM only — the account's DBR runway after this action. */
  dbr?: InverseDbrState
}

export interface CombinedActionResult {
  success: boolean
  data?: CombinedActionResponse
  error?: string
}

const LENDING_ACTIONS_BASE = '/v1/actions/lending'

async function callCombined(
  path: 'deposit-and-borrow' | 'withdraw-and-repay',
  qs: URLSearchParams
): Promise<CombinedActionResult> {
  try {
    const { data, actions } = await apiFetchEnvelope<Partial<CombinedActionResponse>>(
      `${LENDING_ACTIONS_BASE}/${path}`,
      { params: Object.fromEntries(qs) }
    )
    return {
      success: true,
      data: {
        transactions: actions?.transactions ?? [],
        permissions: actions?.permissions ?? [],
        route: data?.route,
        atomic: data?.atomic,
        simulation: data?.simulation,
        rateImpact: data?.rateImpact,
        reveals: data?.reveals,
        dbr: data?.dbr,
      },
    }
  } catch (err) {
    return { success: false, error: errorMessage(err) }
  }
}

// ----------------------------------------------------------------------------
// Deposit + borrow (open)
// ----------------------------------------------------------------------------

export interface DepositAndBorrowParams {
  /** Collateral (supply) market — `lender:chainId:address`. */
  collateralMarketUid: string
  /** Debt (borrow) market — same lender + chain. */
  debtMarketUid: string
  operator: string
  /** Raw collateral amount to supply. */
  collateralAmount: string
  /** Raw amount to borrow. */
  borrowAmount: string
  receiver?: string
  /** Pay currency for the collateral (native sentinel → wrap). */
  payAsset?: string
  /** Aave rate mode of the debt (2 = variable). */
  borrowMode?: string
  accountId?: string
  /** E-mode / config id the collateral factor was computed against. */
  modeId?: string
  /**
   * LlamaLend band count `N` for the loan being OPENED.
   *
   * Distinct from `modeId`: this is not a category id, it is a number the
   * borrower picks that sets the collateral factor and how gradually soft
   * liquidation unwinds — and it is immutable once `create_loan` lands. Omit
   * and the market's default is used, which is what happened for every loan
   * opened from this panel before the control existed.
   */
  bands?: number
  /** Fixed-term broker id (Lista) — enables the atomic composer open; absent =
   *  flex/dynamic borrow (falls back to the sequential path server-side). */
  debtTermId?: number
  /** Delivery currency for the borrowed debt (native sentinel → unwrap and
   *  deliver native, e.g. borrow WBNB → receive BNB). */
  receiveAsset?: string
  simulate?: boolean
}

export async function fetchDepositAndBorrow(
  p: DepositAndBorrowParams
): Promise<CombinedActionResult> {
  const qs = new URLSearchParams()
  qs.set('marketUid', p.collateralMarketUid)
  qs.set('debtMarketUid', p.debtMarketUid)
  qs.set('operator', p.operator)
  qs.set('collateralAmount', p.collateralAmount)
  qs.set('borrowAmount', p.borrowAmount)
  if (p.receiver) qs.set('receiver', p.receiver)
  if (p.payAsset) qs.set('payAsset', p.payAsset)
  if (p.borrowMode) qs.set('borrowMode', p.borrowMode)
  if (p.accountId) qs.set('accountId', p.accountId)
  if (p.modeId) qs.set('modeId', p.modeId)
  if (p.bands != null) qs.set('bands', String(p.bands))
  if (p.debtTermId != null) qs.set('debtTermId', String(p.debtTermId))
  if (p.receiveAsset) qs.set('receiveAsset', p.receiveAsset)
  if (p.simulate) qs.set('simulate', 'true')
  return callCombined('deposit-and-borrow', qs)
}

// ----------------------------------------------------------------------------
// Withdraw + repay (close / reduce)
// ----------------------------------------------------------------------------

export interface WithdrawAndRepayParams {
  /** Debt (repay) market — `lender:chainId:address`. */
  debtMarketUid: string
  /** Collateral (withdraw) market — same lender + chain. */
  collateralMarketUid: string
  operator: string
  /** Raw debt amount to repay (omit when `repayMax`). */
  repayAmount?: string
  /** Raw collateral amount to withdraw (omit when `withdrawMax`). */
  withdrawAmount?: string
  repayMax?: boolean
  withdrawMax?: boolean
  receiver?: string
  /** Pay currency for the repay (native sentinel → wrap). */
  payAsset?: string
  /** Delivery currency for the withdrawn collateral (native sentinel → unwrap). */
  receiveAsset?: string
  borrowMode?: string
  accountId?: string
  simulate?: boolean
}

export async function fetchWithdrawAndRepay(
  p: WithdrawAndRepayParams
): Promise<CombinedActionResult> {
  const qs = new URLSearchParams()
  qs.set('marketUid', p.debtMarketUid)
  qs.set('collateralMarketUid', p.collateralMarketUid)
  qs.set('operator', p.operator)
  if (p.repayAmount) qs.set('repayAmount', p.repayAmount)
  if (p.withdrawAmount) qs.set('withdrawAmount', p.withdrawAmount)
  if (p.repayMax) qs.set('repayMax', 'true')
  if (p.withdrawMax) qs.set('withdrawMax', 'true')
  if (p.receiver) qs.set('receiver', p.receiver)
  if (p.payAsset) qs.set('payAsset', p.payAsset)
  if (p.receiveAsset) qs.set('receiveAsset', p.receiveAsset)
  if (p.borrowMode) qs.set('borrowMode', p.borrowMode)
  if (p.accountId) qs.set('accountId', p.accountId)
  if (p.simulate) qs.set('simulate', 'true')
  return callCombined('withdraw-and-repay', qs)
}
